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
        this.outputChannel = vscode.window.createOutputChannel('Command Runner');
    }
    async runSequence(sequence) {
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
            vscode.window.showInformationMessage(`Running step ${stepNumber}/${sequence.steps.length}: ${step.command}`);
        }
        this.outputChannel.appendLine('\n' + '='.repeat(50));
        this.outputChannel.appendLine('All commands sent to terminal');
        this.outputChannel.appendLine('Note: Terminal will stop automatically if any command fails');
    }
    wrapCommandWithErrorHandling(command, stepNumber) {
        // For PowerShell on Windows
        if (process.platform === 'win32') {
            return `${command}; if ($LASTEXITCODE -ne 0) { Write-Host "Error in step ${stepNumber}: Command failed with exit code $LASTEXITCODE" -ForegroundColor Red; break }`;
        }
        else {
            // For bash/zsh on Unix-like systems
            return `${command} || { echo "Error in step ${stepNumber}: Command failed"; exit 1; }`;
        }
    }
    dispose() {
        this.outputChannel.dispose();
        if (this.terminal) {
            this.terminal.dispose();
        }
    }
}
exports.CommandExecutor = CommandExecutor;
//# sourceMappingURL=commandExecutor.js.map