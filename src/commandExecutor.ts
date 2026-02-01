import * as vscode from "vscode";
import * as path from "path";
import { CommandSequence } from "./commandSequenceProvider";

export class CommandExecutor {
  private terminals: Map<string, vscode.Terminal> = new Map();
  private outputChannel: vscode.OutputChannel;
  private statusBar: vscode.StatusBarItem;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel("Command Runner");
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.statusBar.text = "$(terminal) Command Runner";
    this.statusBar.tooltip = "Command Runner status";
    this.statusBar.show();

    // Clean up internal map when terminal closes
    vscode.window.onDidCloseTerminal((t) => {
      if (this.terminals.has(t.name)) {
        this.terminals.delete(t.name);
        this.outputChannel.appendLine(`Terminal closed: ${t.name}`);
      }
    });
  }

  async runSequence(sequence: CommandSequence): Promise<void> {
    this.outputChannel.clear();
    this.outputChannel.show();
    this.outputChannel.appendLine(`Starting sequence: ${sequence.name}`);
    this.outputChannel.appendLine("=".repeat(50));

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder open");
      return;
    }
    const rootPath = workspaceFolder.uri.fsPath;

    // Decide terminal choices based on sequence/step configuration or prompt once
    const defaultTerminalChoice = (sequence as any).terminal;
    const defaultTerminalName = (sequence as any).terminalName;
    const anyStepHasTerminal = sequence.steps.some(
      (s) => (s as any).terminal !== undefined,
    );

    // If no defaults are present, we'll ask the user once for a terminal to use for the whole run
    let userPickedShell: string | undefined;
    let userPickedTerminalName: string | undefined;
    const needInteractivePick = !defaultTerminalChoice && !anyStepHasTerminal;

    if (needInteractivePick) {
      // Offer preferred shell first
      const preferred =
        vscode.workspace
          .getConfiguration("commandRunner")
          .get<string>("preferredShell") || "Default";
      if (preferred && preferred !== "Default") {
        const usePreferred = await vscode.window.showQuickPick(["Yes", "No"], {
          placeHolder: `Use preferred shell: ${preferred}?`,
        });
        if (usePreferred === "Yes") {
          userPickedShell = preferred;
          userPickedTerminalName = `${sequence.name} [${userPickedShell}]`;
        }
      }

      if (!userPickedShell) {
        const choices: vscode.QuickPickItem[] = [
          {
            label: "New: Default",
            description: "Create a new terminal using the default shell",
          },
          {
            label: "New: PowerShell",
            description: "Create a new PowerShell terminal (pwsh/powershell)",
          },
          {
            label: "New: Git Bash",
            description: "Create a new Git Bash terminal (if installed)",
          },
          { label: "New: Bash", description: "Create a new Bash terminal" },
          {
            label: "New: Cmd",
            description: "Create a new Command Prompt terminal (cmd.exe)",
          },
        ];

        const existing = vscode.window.terminals.map(
          (t) =>
            ({
              label: t.name,
              description: "Existing terminal",
            }) as vscode.QuickPickItem,
        );

        const pick = await vscode.window.showQuickPick(
          [...choices, ...existing],
          { placeHolder: "Select terminal (or choose an existing one)" },
        );
        if (!pick) {
          vscode.window.showInformationMessage(
            "Run cancelled — no terminal selected",
          );
          return;
        }

        if (pick.description === "Existing terminal") {
          const found = vscode.window.terminals.find(
            (t) => t.name === pick.label,
          );
          if (!found) {
            vscode.window.showErrorMessage("Selected terminal not found");
            return;
          }
          userPickedTerminalName = pick.label; // reuse existing terminal name
          userPickedShell = undefined; // unknown shell, but terminal name will be used
        } else {
          userPickedShell = pick.label.replace("New: ", "").trim();
          userPickedTerminalName = `${sequence.name} [${userPickedShell}]`;
        }
      }
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Running: ${sequence.name}`,
        cancellable: true,
      },
      async (progress, token) => {
        token.onCancellationRequested(() => {
          this.outputChannel.appendLine(
            "\nCancelled by user. No further steps will be sent.",
          );
          this.statusBar.text = "$(circle-slash) Command Runner: Cancelled";
        });

        for (let i = 0; i < sequence.steps.length; i++) {
          if (token.isCancellationRequested) {
            break;
          }
          const step = sequence.steps[i];
          const stepNumber = i + 1;
          const total = sequence.steps.length;

          this.outputChannel.appendLine(`\nStep ${stepNumber}/${total}:`);
          this.outputChannel.appendLine(`  Directory: ${step.directory}`);
          this.outputChannel.appendLine(`  Command: ${step.command}`);

          // Resolve directory path
          let targetDir = step.directory;
          if (!path.isAbsolute(targetDir)) {
            targetDir = path.join(rootPath, targetDir);
          }

          // Determine terminal choice for this step (step overrides sequence; interactive pick is fallback)
          const stepTerminalChoice =
            (step as any).terminal ??
            (defaultTerminalChoice as string | undefined) ??
            userPickedShell;
          const stepTerminalName =
            (step as any).terminalName ??
            (defaultTerminalName as string | undefined) ??
            userPickedTerminalName;
          const termLabel = stepTerminalName
            ? stepTerminalName
            : `${sequence.name}${stepTerminalChoice ? " [" + stepTerminalChoice + "]" : ""}`;
          const terminalForStep = this.ensureTerminal(
            termLabel,
            stepTerminalChoice,
          );

          // Send commands to terminal
          terminalForStep.sendText(`cd "${targetDir}"`);

          // Update progress and status bar
          progress.report({
            message: `Step ${stepNumber}/${total}: ${step.command}`,
            increment: 100 / total,
          });
          this.statusBar.text = `$(play) Command Runner: ${sequence.name} (${stepNumber}/${total})`;

          // Add error handling wrapper for the command
          const wrappedCommand = this.wrapCommandWithErrorHandling(
            step.command,
            stepNumber,
            stepTerminalChoice,
          );
          terminalForStep.sendText(wrappedCommand);

          // Show progress notification
          vscode.window.showInformationMessage(
            `Running step ${stepNumber}/${total}: ${step.command}`,
          );
        }

        this.outputChannel.appendLine("\n" + "=".repeat(50));
        this.outputChannel.appendLine("All commands sent to terminal");
        this.outputChannel.appendLine(
          "Note: Terminal will stop automatically if any command fails",
        );
        this.statusBar.text = "$(check) Command Runner: Completed";
      },
    );
  }

  private ensureTerminal(name: string, shellChoice?: string): vscode.Terminal {
    const existing = this.terminals.get(name);
    if (existing && existing.exitStatus === undefined) {
      existing.show();
      return existing;
    }

    const options: vscode.TerminalOptions = { name } as any;
    const shellPath = this.getShellPathForChoice(shellChoice);
    if (shellPath) {
      (options as any).shellPath = shellPath;
    }

    const terminal = vscode.window.createTerminal(options);
    terminal.show();
    this.terminals.set(name, terminal);
    return terminal;
  }

  private getShellPathForChoice(choice?: string): string | undefined {
    if (!choice || choice === "Default") {
      return undefined;
    }

    const config = vscode.workspace.getConfiguration("commandRunner");

    if (choice === "PowerShell") {
      // Prefer pwsh, fallback to Windows PowerShell
      return process.platform === "win32" ? "pwsh" : "pwsh";
    }

    if (choice === "Git Bash") {
      const configured = config.get<string>("gitBashPath");
      if (configured) {
        return configured;
      }
      if (process.platform === "win32") {
        // Common Git Bash locations
        const possible = [
          "C:\\Program Files\\Git\\bin\\bash.exe",
          "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
        ];
        return possible.find((p) => p) as string | undefined; // we don't check fs here to avoid sync IO
      }
      return "bash";
    }

    if (choice === "Bash") {
      return "bash";
    }

    if (choice === "Cmd") {
      return process.platform === "win32" ? "cmd.exe" : undefined;
    }

    return undefined;
  }

  private wrapCommandWithErrorHandling(
    command: string,
    stepNumber: number,
    shellChoice?: string,
  ): string {
    const isPowerShell =
      shellChoice === "PowerShell" ||
      (shellChoice === undefined && process.platform === "win32");

    if (isPowerShell) {
      return `${command}; if ($LASTEXITCODE -ne 0) { Write-Host "Error in step ${stepNumber}: Command failed with exit code $LASTEXITCODE" -ForegroundColor Red; exit $LASTEXITCODE }`;
    } else {
      // Bash-like error handling covers bash, git bash, and sh
      return `${command} || { echo "Error in step ${stepNumber}: Command failed"; exit 1; }`;
    }
  }

  dispose(): void {
    this.outputChannel.dispose();
    for (const term of this.terminals.values()) {
      try {
        term.dispose();
      } catch (e) {
        /* ignore */
      }
    }
    this.terminals.clear();
    if (this.statusBar) {
      this.statusBar.dispose();
    }
  }
}
