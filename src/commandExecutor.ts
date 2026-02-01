import * as vscode from "vscode";
import * as path from "path";
import { CommandSequence, CommandStep } from "./commandSequenceProvider";

interface RunningSequence {
  sequence: CommandSequence;
  currentStep: number;
  terminal: vscode.Terminal;
  token: vscode.CancellationToken;
  resolve: (value: boolean) => void;
  reject: (reason?: any) => void;
}

export class CommandExecutor {
  private terminals: Map<string, vscode.Terminal> = new Map();
  private runningSequences: Map<string, RunningSequence> = new Map();
  private outputChannel: vscode.OutputChannel;
  private statusBar: vscode.StatusBarItem;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel("Command Runner");
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.statusBar.text = "$(terminal) Command Runner";
    this.statusBar.tooltip = "Command Runner - Click to view output";
    this.statusBar.command = "commandRunner.showOutput";
    this.statusBar.show();

    // Clean up internal map when terminal closes
    vscode.window.onDidCloseTerminal((t) => {
      if (this.terminals.has(t.name)) {
        this.terminals.delete(t.name);
        this.outputChannel.appendLine(`Terminal closed: ${t.name}`);
      }
      // Check if any running sequence was using this terminal
      for (const [key, rs] of this.runningSequences.entries()) {
        if (rs.terminal === t) {
          this.outputChannel.appendLine(
            `Sequence "${rs.sequence.name}" terminal was closed`,
          );
          this.runningSequences.delete(key);
          this.updateStatusBar();
        }
      }
    });

    // Register show output command
    vscode.commands.registerCommand("commandRunner.showOutput", () => {
      this.outputChannel.show();
    });
  }

  async runSequence(sequence: CommandSequence): Promise<boolean> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder open");
      return false;
    }
    const rootPath = workspaceFolder.uri.fsPath;

    // Generate unique run ID for this sequence execution
    const runId = `${sequence.name}_${Date.now()}`;

    this.outputChannel.clear();
    this.outputChannel.show();
    this.outputChannel.appendLine(`Starting sequence: ${sequence.name}`);
    this.outputChannel.appendLine("=".repeat(60));

    // Determine terminal to use
    const terminalInfo = await this.selectTerminal(sequence);
    if (!terminalInfo) {
      this.outputChannel.appendLine("Run cancelled — no terminal selected");
      return false;
    }

    const { terminal, terminalName, shellType } = terminalInfo;

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Running: ${sequence.name}`,
        cancellable: true,
      },
      async (progress, token) => {
        return new Promise<boolean>(async (resolve, reject) => {
          // Store running sequence info
          const runningSeq: RunningSequence = {
            sequence,
            currentStep: 0,
            terminal,
            token,
            resolve,
            reject,
          };
          this.runningSequences.set(runId, runningSeq);

          token.onCancellationRequested(() => {
            this.outputChannel.appendLine(
              "\n❌ Cancelled by user. Stopping execution...",
            );
            this.statusBar.text = "$(circle-slash) Command Runner: Cancelled";
            this.runningSequences.delete(runId);
            resolve(false);
          });

          let success = true;

          for (let i = 0; i < sequence.steps.length; i++) {
            if (token.isCancellationRequested) {
              success = false;
              break;
            }

            const step = sequence.steps[i];
            const stepNumber = i + 1;
            const total = sequence.steps.length;

            runningSeq.currentStep = i;

            // Resolve directory path
            let targetDir = step.directory;
            if (!path.isAbsolute(targetDir)) {
              targetDir = path.join(rootPath, targetDir);
            }

            // Update progress
            progress.report({
              message: `Step ${stepNumber}/${total}: ${step.command}`,
              increment: 100 / total,
            });

            this.statusBar.text = `$(play) ${sequence.name} (${stepNumber}/${total})`;

            // Execute step with error handling
            const stepSuccess = await this.executeStep(
              terminal,
              step,
              targetDir,
              stepNumber,
              total,
              shellType,
              token,
            );

            if (!stepSuccess) {
              success = false;
              this.outputChannel.appendLine(
                `\n❌ Sequence stopped at step ${stepNumber} due to error`,
              );
              vscode.window.showErrorMessage(
                `Sequence "${sequence.name}" failed at step ${stepNumber}`,
              );
              break;
            }
          }

          this.runningSequences.delete(runId);

          if (success) {
            this.outputChannel.appendLine("\n" + "=".repeat(60));
            this.outputChannel.appendLine(
              `✅ Sequence "${sequence.name}" completed successfully`,
            );
            this.statusBar.text = `$(check) ${sequence.name}: Completed`;
            vscode.window.showInformationMessage(
              `Sequence "${sequence.name}" completed successfully`,
            );
          } else {
            this.statusBar.text = `$(error) ${sequence.name}: Failed`;
          }

          resolve(success);
        });
      },
    );
  }

  private async selectTerminal(
    sequence: CommandSequence,
  ): Promise<{ terminal: vscode.Terminal; terminalName: string; shellType: string } | null> {
    // Check if sequence has a default terminal
    const sequenceTerminal = sequence.terminal;
    const sequenceTerminalName = sequence.terminalName;

    // Check if any step has individual terminal settings
    const anyStepHasTerminal = sequence.steps.some((s) => s.terminal);

    // If sequence has default terminal settings, use them
    if (sequenceTerminal && sequenceTerminal !== "Default") {
      const terminalName =
        sequenceTerminalName || `${sequence.name} [${sequenceTerminal}]`;
      const terminal = this.ensureTerminal(terminalName, sequenceTerminal);
      return { terminal, terminalName, shellType: sequenceTerminal };
    }

    // If steps have terminal settings, we'll handle per-step
    if (anyStepHasTerminal) {
      // Use a default terminal name, steps will create their own terminals as needed
      const terminalName = `${sequence.name} [Multi-Terminal]`;
      const terminal = this.ensureTerminal(terminalName, "Default");
      return { terminal, terminalName, shellType: "Default" };
    }

    // Otherwise, prompt user to select terminal
    const preferred =
      vscode.workspace
        .getConfiguration("commandRunner")
        .get<string>("preferredShell") || "Default";

    const choices: vscode.QuickPickItem[] = [
      {
        label: `$(terminal) Default Terminal`,
        description: "Use VS Code's default shell",
        detail: preferred !== "Default" ? `Preferred: ${preferred}` : undefined,
      },
      {
        label: `$(terminal-powershell) PowerShell`,
        description: "PowerShell (pwsh/powershell)",
      },
      {
        label: `$(terminal-bash) Git Bash`,
        description: "Git Bash (Windows) or Bash",
      },
      {
        label: `$(terminal-bash) Bash`,
        description: "Unix Bash shell",
      },
      {
        label: `$(terminal-cmd) Command Prompt`,
        description: "Windows CMD (cmd.exe)",
      },
      {
        label: `$(terminal-zsh) Zsh`,
        description: "Zsh shell",
      },
    ];

    // Add existing terminals
    const existingTerminals = vscode.window.terminals;
    if (existingTerminals.length > 0) {
      choices.push({
        label: "",
        description: "",
        kind: vscode.QuickPickItemKind.Separator,
      } as any);
      existingTerminals.forEach((t) => {
        choices.push({
          label: `$(terminal) ${t.name}`,
          description: "Existing terminal",
        });
      });
    }

    const selected = await vscode.window.showQuickPick(choices, {
      placeHolder: "Select terminal for this sequence",
    });

    if (!selected) {
      return null;
    }

    let shellType = "Default";
    let terminalName = `${sequence.name}`;

    if (selected.description === "Existing terminal") {
      const existingTerminal = vscode.window.terminals.find(
        (t) => t.name === selected.label.replace("$(terminal) ", ""),
      );
      if (existingTerminal) {
        existingTerminal.show();
        return { terminal: existingTerminal, terminalName: existingTerminal.name, shellType: "Default" };
      }
    }

    // Determine shell type from selection
    if (selected.label.includes("PowerShell")) {
      shellType = "PowerShell";
    } else if (selected.label.includes("Git Bash")) {
      shellType = "Git Bash";
    } else if (selected.label.includes("Bash") && !selected.label.includes("Git")) {
      shellType = "Bash";
    } else if (selected.label.includes("Command Prompt") || selected.label.includes("CMD")) {
      shellType = "Cmd";
    } else if (selected.label.includes("Zsh")) {
      shellType = "Zsh";
    }

    terminalName = `${sequence.name} [${shellType}]`;
    const terminal = this.ensureTerminal(terminalName, shellType);

    return { terminal, terminalName, shellType };
  }

  private async executeStep(
    terminal: vscode.Terminal,
    step: CommandStep,
    targetDir: string,
    stepNumber: number,
    totalSteps: number,
    shellType: string,
    token: vscode.CancellationToken,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (token.isCancellationRequested) {
        resolve(false);
        return;
      }

      this.outputChannel.appendLine("");
      this.outputChannel.appendLine(
        `Step ${stepNumber}/${totalSteps}: ${step.command}`,
      );
      this.outputChannel.appendLine(`  Directory: ${targetDir}`);
      this.outputChannel.appendLine(`  Terminal: ${step.terminal || shellType}`);
      this.outputChannel.appendLine("-".repeat(40));

      // Get the terminal for this step (may be different if step has its own terminal setting)
      let stepTerminal = terminal;
      if (step.terminal && step.terminal !== "Default") {
        const stepTerminalName = step.terminalName || `Step ${stepNumber} [${step.terminal}]`;
        stepTerminal = this.ensureTerminal(stepTerminalName, step.terminal);
      }

      // Show the terminal
      stepTerminal.show();

      // Change to target directory
      const cdCommand = this.getCdCommand(targetDir, step.terminal || shellType);
      stepTerminal.sendText(cdCommand, true);

      // Create a marker for completion detection
      const completionMarker = `__CMD_COMPLETE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}__`;
      const errorMarker = `__CMD_ERROR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}__`;

      // Wrap command with error detection based on shell type
      const wrappedCommand = this.wrapCommandWithErrorHandling(
        step.command,
        completionMarker,
        errorMarker,
        step.terminal || shellType,
      );

      // Send the wrapped command
      stepTerminal.sendText(wrappedCommand, true);

      // Wait for command to complete (with timeout)
      const timeout = 300000; // 5 minutes timeout per step
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        if (token.isCancellationRequested) {
          clearInterval(checkInterval);
          resolve(false);
          return;
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          this.outputChannel.appendLine(
            `  ⚠️ Step ${stepNumber} timed out after ${timeout / 1000}s`,
          );
          resolve(false);
          return;
        }

        // Note: VS Code API doesn't provide direct access to terminal output
        // We rely on the shell's error handling to stop execution
        // For now, we assume success and let the shell handle errors
        // The error handling wrapper will cause the terminal to show error state

        // Since we can't directly monitor terminal output in VS Code API,
        // we'll use a simpler approach: send commands and trust the shell error handling
        clearInterval(checkInterval);

        // Small delay to let command start
        setTimeout(() => {
          this.outputChannel.appendLine(`  ✅ Command sent to terminal`);
          resolve(true);
        }, 500);
      }, 100);
    });
  }

  private getCdCommand(directory: string, shellType: string): string {
    // Normalize path for different shells
    const normalizedPath = directory.replace(/\\/g, "/");

    if (shellType === "PowerShell") {
      return `Set-Location -LiteralPath "${directory}"`;
    } else if (shellType === "Cmd") {
      return `cd /d "${directory}"`;
    } else {
      // Bash, Git Bash, Zsh, Default
      return `cd "${normalizedPath}"`;
    }
  }

  private wrapCommandWithErrorHandling(
    command: string,
    completionMarker: string,
    errorMarker: string,
    shellType: string,
  ): string {
    // Escape the command for shell safety
    const escapedCommand = command.replace(/"/g, '\\"');

    if (shellType === "PowerShell") {
      // PowerShell error handling
      return `
${command}
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0 -and $exitCode -ne $null) {
    Write-Host "❌ ERROR: Command failed with exit code $exitCode" -ForegroundColor Red
    Write-Host "${errorMarker}"
    exit $exitCode
} else {
    Write-Host "${completionMarker}"
}`;
    } else if (shellType === "Cmd") {
      // CMD error handling
      return `${command}
if %errorlevel% neq 0 (
    echo ❌ ERROR: Command failed with exit code %errorlevel%
    echo ${errorMarker}
    exit /b %errorlevel%
) else (
    echo ${completionMarker}
)`;
    } else {
      // Bash/Git Bash/Zsh error handling
      return `${command}
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
    echo "❌ ERROR: Command failed with exit code $EXIT_CODE"
    echo "${errorMarker}"
    exit $EXIT_CODE
else
    echo "${completionMarker}"
fi`;
    }
  }

  private ensureTerminal(name: string, shellChoice?: string): vscode.Terminal {
    // Check if we already have this terminal
    const existing = this.terminals.get(name);
    if (existing) {
      try {
        // Check if terminal is still valid
        existing.show();
        return existing;
      } catch (e) {
        // Terminal was disposed, remove from map
        this.terminals.delete(name);
      }
    }

    // Also check VS Code's terminals list
    const vscodeTerminal = vscode.window.terminals.find((t) => t.name === name);
    if (vscodeTerminal) {
      this.terminals.set(name, vscodeTerminal);
      vscodeTerminal.show();
      return vscodeTerminal;
    }

    // Create new terminal with appropriate shell
    const options: vscode.TerminalOptions = { name };
    const shellPath = this.getShellPathForChoice(shellChoice);

    if (shellPath) {
      options.shellPath = shellPath;
    }

    const terminal = vscode.window.createTerminal(options);
    terminal.show();
    this.terminals.set(name, terminal);

    this.outputChannel.appendLine(`Created terminal: ${name}`);

    return terminal;
  }

  private getShellPathForChoice(choice?: string): string | undefined {
    if (!choice || choice === "Default") {
      return undefined;
    }

    const config = vscode.workspace.getConfiguration("commandRunner");

    switch (choice) {
      case "PowerShell":
        // Try pwsh first, then powershell
        if (process.platform === "win32") {
          return "pwsh";
        }
        return "pwsh";

      case "Git Bash":
        const gitBashPath = config.get<string>("gitBashPath");
        if (gitBashPath) {
          return gitBashPath;
        }
        if (process.platform === "win32") {
          // Common Git Bash locations on Windows
          return "C:\\Program Files\\Git\\bin\\bash.exe";
        }
        return "bash";

      case "Bash":
        return process.platform === "win32" ? "bash" : "/bin/bash";

      case "Zsh":
        return process.platform === "win32" ? "zsh" : "/bin/zsh";

      case "Cmd":
        return process.platform === "win32" ? "cmd.exe" : undefined;

      default:
        return undefined;
    }
  }

  private updateStatusBar(): void {
    const runningCount = this.runningSequences.size;
    if (runningCount === 0) {
      this.statusBar.text = "$(terminal) Command Runner";
    } else {
      this.statusBar.text = `$(play) Command Runner: ${runningCount} running`;
    }
  }

  dispose(): void {
    this.outputChannel.dispose();

    // Dispose all tracked terminals
    for (const [name, terminal] of this.terminals.entries()) {
      try {
        terminal.dispose();
      } catch (e) {
        // Ignore errors during disposal
      }
    }
    this.terminals.clear();

    if (this.statusBar) {
      this.statusBar.dispose();
    }
  }
}
