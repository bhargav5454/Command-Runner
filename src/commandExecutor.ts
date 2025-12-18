import * as vscode from 'vscode';
import * as path from 'path';
import { CommandSequence } from './commandSequenceProvider';

export class CommandExecutor {
    private terminal: vscode.Terminal | undefined;
    private outputChannel: vscode.OutputChannel;
    private statusBar: vscode.StatusBarItem;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Command Runner');
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBar.text = '$(terminal) Command Runner';
        this.statusBar.tooltip = 'Command Runner status';
        this.statusBar.show();
    }

    async runSequence(sequence: CommandSequence): Promise<void> {
        this.outputChannel.clear();
        this.outputChannel.show();
        this.outputChannel.appendLine(`Starting sequence: ${sequence.name}`);
        this.outputChannel.appendLine('='.repeat(50));

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        const rootPath = workspaceFolder.uri.fsPath;

        // Create or reuse terminal
        // if (!this.terminal || this.terminal.exitStatus !== undefined) {
        //     this.terminal = vscode.window.createTerminal('Command Runner');
        // }
        // this.terminal.show();
        const terminal = this.ensureTerminal();

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Running: ${sequence.name}`,
            cancellable: true
        }, async (progress, token) => {
            token.onCancellationRequested(() => {
                this.outputChannel.appendLine('\nCancelled by user. No further steps will be sent.');
                this.statusBar.text = '$(circle-slash) Command Runner: Cancelled';
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
                progress.report({ message: `Step ${stepNumber}/${total}: ${step.command}`, increment: (100 / total) });
                this.statusBar.text = `$(play) Command Runner: ${sequence.name} (${stepNumber}/${total})`;

                // Add error handling wrapper for the command
                const wrappedCommand = this.wrapCommandWithErrorHandling(step.command, stepNumber);
                terminal.sendText(wrappedCommand);

                // Show progress notification
                vscode.window.showInformationMessage(
                    `Running step ${stepNumber}/${total}: ${step.command}`
                );
            }

            this.outputChannel.appendLine('\n' + '='.repeat(50));
            this.outputChannel.appendLine('All commands sent to terminal');
            this.outputChannel.appendLine('Note: Terminal will stop automatically if any command fails');
            this.statusBar.text = '$(check) Command Runner: Completed';
        });
    }

    private ensureTerminal(): vscode.Terminal {
        if (!this.terminal || this.terminal.exitStatus !== undefined) {
            this.terminal = vscode.window.createTerminal('Command Runner');
        }
        this.terminal.show();
        return this.terminal;
    }

    private wrapCommandWithErrorHandling(command: string, stepNumber: number): string {
        // For PowerShell on Windows
        if (process.platform === 'win32') {
            return `${command}; if ($LASTEXITCODE -ne 0) { Write-Host "Error in step ${stepNumber}: Command failed with exit code $LASTEXITCODE" -ForegroundColor Red; exit $LASTEXITCODE }`;
        } else {
            // For bash/zsh on Unix-like systems
            return `${command} || { echo "Error in step ${stepNumber}: Command failed"; exit 1; }`;
        }
    }

    dispose(): void {
        this.outputChannel.dispose();
        if (this.terminal) {
            this.terminal.dispose();
        }
        if (this.statusBar) {
            this.statusBar.dispose();
        }
    }
}
