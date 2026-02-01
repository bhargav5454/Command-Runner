"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandExecutor = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class CommandExecutor {
    constructor() {
        this.terminals = new Map();
        this.outputChannel = vscode.window.createOutputChannel("Command Runner");
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
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
    async runSequence(sequence) {
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
        // Check for preferred shell from configuration and offer to use it
        const preferred = vscode.workspace
            .getConfiguration("commandRunner")
            .get("preferredShell") || "Default";
        let terminal;
        let selectedShell;
        if (preferred && preferred !== "Default") {
            const usePreferred = await vscode.window.showQuickPick(["Yes", "No"], {
                placeHolder: `Use preferred shell: ${preferred}?`,
            });
            if (usePreferred === "Yes") {
                selectedShell = preferred;
                const termName = `${sequence.name} [${selectedShell}]`;
                terminal = this.ensureTerminal(termName, selectedShell);
            }
        }
        if (!terminal) {
            // Ask user which terminal to use/create
            const choices = [
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
            const existing = vscode.window.terminals.map((t) => ({
                label: t.name,
                description: "Existing terminal",
            }));
            const pick = await vscode.window.showQuickPick([...choices, ...existing], {
                placeHolder: "Select terminal (or choose an existing one)",
            });
            if (!pick) {
                vscode.window.showInformationMessage("Run cancelled — no terminal selected");
                return;
            }
            if (pick.description === "Existing terminal") {
                const found = vscode.window.terminals.find((t) => t.name === pick.label);
                if (!found) {
                    vscode.window.showErrorMessage("Selected terminal not found");
                    return;
                }
                terminal = found;
            }
            else {
                // New terminal requested
                selectedShell = pick.label.replace("New: ", "").trim();
                const termName = `${sequence.name} [${selectedShell}]`;
                terminal = this.ensureTerminal(termName, selectedShell);
            }
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Running: ${sequence.name}`,
            cancellable: true,
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.outputChannel.appendLine("\nCancelled by user. No further steps will be sent.");
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
                // Send commands to terminal
                terminal.sendText(`cd "${targetDir}"`);
                // Update progress and status bar
                progress.report({
                    message: `Step ${stepNumber}/${total}: ${step.command}`,
                    increment: 100 / total,
                });
                this.statusBar.text = `$(play) Command Runner: ${sequence.name} (${stepNumber}/${total})`;
                // Add error handling wrapper for the command
                const wrappedCommand = this.wrapCommandWithErrorHandling(step.command, stepNumber, selectedShell);
                terminal.sendText(wrappedCommand);
                // Show progress notification
                vscode.window.showInformationMessage(`Running step ${stepNumber}/${total}: ${step.command}`);
            }
            this.outputChannel.appendLine("\n" + "=".repeat(50));
            this.outputChannel.appendLine("All commands sent to terminal");
            this.outputChannel.appendLine("Note: Terminal will stop automatically if any command fails");
            this.statusBar.text = "$(check) Command Runner: Completed";
        });
    }
    ensureTerminal(name, shellChoice) {
        const existing = this.terminals.get(name);
        if (existing && existing.exitStatus === undefined) {
            existing.show();
            return existing;
        }
        const options = { name };
        const shellPath = this.getShellPathForChoice(shellChoice);
        if (shellPath) {
            options.shellPath = shellPath;
        }
        const terminal = vscode.window.createTerminal(options);
        terminal.show();
        this.terminals.set(name, terminal);
        return terminal;
    }
    getShellPathForChoice(choice) {
        if (!choice || choice === "Default") {
            return undefined;
        }
        const config = vscode.workspace.getConfiguration("commandRunner");
        if (choice === "PowerShell") {
            // Prefer pwsh, fallback to Windows PowerShell
            return process.platform === "win32" ? "pwsh" : "pwsh";
        }
        if (choice === "Git Bash") {
            const configured = config.get("gitBashPath");
            if (configured) {
                return configured;
            }
            if (process.platform === "win32") {
                // Common Git Bash locations
                const possible = [
                    "C:\\Program Files\\Git\\bin\\bash.exe",
                    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
                ];
                return possible.find((p) => p); // we don't check fs here to avoid sync IO
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
    wrapCommandWithErrorHandling(command, stepNumber, shellChoice) {
        const isPowerShell = shellChoice === "PowerShell" ||
            (shellChoice === undefined && process.platform === "win32");
        if (isPowerShell) {
            return `${command}; if ($LASTEXITCODE -ne 0) { Write-Host "Error in step ${stepNumber}: Command failed with exit code $LASTEXITCODE" -ForegroundColor Red; exit $LASTEXITCODE }`;
        }
        else {
            // Bash-like error handling covers bash, git bash, and sh
            return `${command} || { echo "Error in step ${stepNumber}: Command failed"; exit 1; }`;
        }
    }
    dispose() {
        this.outputChannel.dispose();
        for (const term of this.terminals.values()) {
            try {
                term.dispose();
            }
            catch (e) {
                /* ignore */
            }
        }
        this.terminals.clear();
        if (this.statusBar) {
            this.statusBar.dispose();
        }
    }
}
exports.CommandExecutor = CommandExecutor;
//# sourceMappingURL=commandExecutor.js.map