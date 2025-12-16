import * as vscode from 'vscode';
import * as path from 'path';
import { CommandSequence } from './commandSequenceProvider';

export class CommandExecutor {
    private terminal: vscode.Terminal | undefined;
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Command Runner');
    }

    async runSequence(sequence: CommandSequence): Promise<void> {
        this.outputChannel.clear();
        this.outputChannel.show();
        this.outputChannel.appendLine(`Starting sequence: ${sequence.name}`);
        this.outputChannel.appendLine('='.repeat(50));

        // Create or reuse terminal
        if (!this.terminal || this.terminal.exitStatus !== undefined) {
            this.terminal = vscode.window.createTerminal('Command Runner');
        }
        this.terminal.show();

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        // Execute each step
        for (let i = 0; i < sequence.steps.length; i++) {
            const step = sequence.steps[i];
            const stepNumber = i + 1;
            
            this.outputChannel.appendLine(`\nStep ${stepNumber}/${sequence.steps.length}:`);
            this.outputChannel.appendLine(`  Directory: ${step.directory}`);
            this.outputChannel.appendLine(`  Command: ${step.command}`);

            // Resolve directory path
            let targetDir = step.directory;
            if (!path.isAbsolute(targetDir)) {
                targetDir = path.join(rootPath, targetDir);
            }

            // Send commands to terminal
            this.terminal.sendText(`cd "${targetDir}"`);
            
            // Add error handling wrapper for the command
            const wrappedCommand = this.wrapCommandWithErrorHandling(step.command, stepNumber);
            this.terminal.sendText(wrappedCommand);

            // Show progress notification
            vscode.window.showInformationMessage(
                `Running step ${stepNumber}/${sequence.steps.length}: ${step.command}`
            );
        }

        this.outputChannel.appendLine('\n' + '='.repeat(50));
        this.outputChannel.appendLine('All commands sent to terminal');
        this.outputChannel.appendLine('Note: Terminal will stop automatically if any command fails');
    }

    private wrapCommandWithErrorHandling(command: string, stepNumber: number): string {
        // For PowerShell on Windows
        if (process.platform === 'win32') {
            return `${command}; if ($LASTEXITCODE -ne 0) { Write-Host "Error in step ${stepNumber}: Command failed with exit code $LASTEXITCODE" -ForegroundColor Red; break }`;
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
    }
}
