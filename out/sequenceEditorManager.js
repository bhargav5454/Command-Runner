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
exports.SequenceEditorManager = void 0;
const vscode = __importStar(require("vscode"));
class SequenceEditorManager {
    constructor(panel, extensionUri, provider, initialSequence) {
        this.provider = provider;
        this.initialSequence = initialSequence;
        this._disposables = [];
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case "save": {
                    const newSeq = message.sequence;
                    const oldName = message.oldName;
                    if (oldName && oldName !== newSeq.name) {
                        await this.provider.deleteSequence(oldName);
                    }
                    await this.provider.saveSequence(newSeq);
                    vscode.window.showInformationMessage(`Saved sequence "${newSeq.name}" with ${newSeq.steps.length} steps`);
                    this._panel.dispose();
                    break;
                }
                case "cancel": {
                    this._panel.dispose();
                    break;
                }
                case "error": {
                    vscode.window.showErrorMessage(message.message);
                    break;
                }
            }
        }, null, this._disposables);
    }
    static createOrShow(extensionUri, provider, initial) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        // If we already have a panel, show it.
        // Note: We allow multiple editors if they are for different sequences or new sequences.
        // But for simplicity, let's keep one active for now or check if we want to allow multiple.
        // The current implementation allows one global 'currentPanel'.
        // Let's change this to allow multiple if they are editing different things, but for now sticking to the pattern.
        if (SequenceEditorManager.currentPanel) {
            SequenceEditorManager.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel("sequenceEditor", initial ? `Edit Sequence: ${initial.name}` : "Add New Sequence", column || vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
        });
        SequenceEditorManager.currentPanel = new SequenceEditorManager(panel, extensionUri, provider, initial);
    }
    dispose() {
        SequenceEditorManager.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }
    _getHtmlForWebview(webview) {
        const nonce = getNonce();
        const initialData = this.initialSequence
            ? JSON.stringify(this.initialSequence)
            : "null";
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <!-- Use a content security policy to only allow loading specific resources in the webview -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sequence Editor</title>
    <style>
        :root {
            --container-paddding: 20px;
            --input-padding-vertical: 6px;
            --input-padding-horizontal: 8px;
            --input-margin-vertical: 4px;
            --input-margin-horizontal: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: var(--container-paddding);
            margin: 0;
        }

        h1 {
            font-size: 1.2rem;
            font-weight: 500;
            margin-bottom: 20px;
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--vscode-input-placeholderForeground);
        }

        input[type="text"] {
            width: 100%;
            padding: var(--input-padding-vertical) var(--input-padding-horizontal);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            outline: none;
            box-sizing: border-box;
        }

        input[type="text"]:focus {
            border-color: var(--vscode-focusBorder);
        }

        .steps-container {
            margin-top: 20px;
        }

        .step-list {
            list-style-type: none;
            padding: 0;
            margin: 0;
        }

        .step-item {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 12px;
            display: flex;
            flex-direction: column;
            position: relative;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .step-item.dragging {
            opacity: 0.5;
            border-style: dashed;
        }

        .step-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            cursor: move;
        }

        .step-title {
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .drag-handle {
            cursor: grab;
            color: var(--vscode-foreground);
            opacity: 0.6;
        }

        .drag-handle:hover {
            opacity: 1;
        }

        .step-actions {
            display: flex;
            gap: 8px;
        }

        .icon-btn {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .icon-btn:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }

        .icon-btn.delete:hover {
            color: var(--vscode-errorForeground);
        }

        .step-content {
            display: grid;
            grid-template-columns: 1fr 2fr;
            gap: 12px;
        }

        .field-group {
            display: flex;
            flex-direction: column;
        }

        .field-group label {
            font-size: 0.85rem;
            margin-bottom: 4px;
        }

        .actions-bar {
            margin-top: 24px;
            display: flex;
            gap: 12px;
            padding-top: 16px;
            border-top: 1px solid var(--vscode-widget-border);
        }

        button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 2px;
            cursor: pointer;
            font-weight: 500;
        }

        button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 8px 16px;
            border-radius: 2px;
            cursor: pointer;
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .empty-state {
            text-align: center;
            padding: 30px;
            color: var(--vscode-descriptionForeground);
            border: 1px dashed var(--vscode-widget-border);
            border-radius: 4px;
            margin-bottom: 12px;
        }

        /* SVG Icons */
        .icon {
            width: 16px;
            height: 16px;
            fill: currentColor;
        }
    </style>
</head>
<body>
    <h1 id="page-title"></h1>
    
    <div class="form-group">
        <label for="seqName">Sequence Name</label>
        <input type="text" id="seqName" placeholder="e.g., Build and Deploy" />
    </div>

    <div class="form-group">
        <label for="defaultTerminal">Default Terminal</label>
        <select id="defaultTerminal">
            <option>Default</option>
            <option>PowerShell</option>
            <option>Git Bash</option>
            <option>Bash</option>
            <option>Cmd</option>
        </select>
    </div>

    <div class="steps-container">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <label style="margin: 0;">Command Steps</label>
            <button id="addStepBtn" class="secondary" style="font-size: 0.9rem; padding: 4px 10px;">+ Add Step</button>
        </div>
        
        <div id="stepsList" class="step-list">
            <!-- Steps will be injected here -->
        </div>
        <div id="emptyState" class="empty-state" style="display: none;">
            No steps added yet. Click "Add Step" to begin.
        </div>
    </div>

    <div class="actions-bar">
        <button id="saveBtn" class="primary">Save Sequence</button>
        <button id="cancelBtn" class="secondary">Cancel</button>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const initialData = ${initialData};
        
        let state = {
            name: initialData ? initialData.name : '',
            steps: initialData ? initialData.steps : [],
            defaultTerminal: initialData ? (initialData.terminal || 'Default') : 'Default'
        };
        
        const oldName = initialData ? initialData.name : undefined;

        // Elements
        const pageTitle = document.getElementById('page-title');
        const seqNameInput = document.getElementById('seqName');
        const stepsList = document.getElementById('stepsList');
        const emptyState = document.getElementById('emptyState');
        const addStepBtn = document.getElementById('addStepBtn');
        const saveBtn = document.getElementById('saveBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        // Initialization
        function init() {
            pageTitle.textContent = initialData ? 'Edit Command Sequence' : 'Create New Command Sequence';
            seqNameInput.value = state.name;
            renderSteps();
        }

        // Render Steps
        function renderSteps() {
            stepsList.innerHTML = '';
            
            if (state.steps.length === 0) {
                emptyState.style.display = 'block';
            } else {
                emptyState.style.display = 'none';
                state.steps.forEach((step, index) => {
                    const li = document.createElement('div');
                    li.className = 'step-item';
                    li.draggable = true;
                    li.dataset.index = index;

                    // Header
                    const header = document.createElement('div');
                    header.className = 'step-header';
                    
                    const title = document.createElement('div');
                    title.className = 'step-title';
                    title.innerHTML = \`
                        <span class="drag-handle" title="Drag to reorder">
                            <svg class="icon" viewBox="0 0 16 16"><path d="M10 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm8-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm8-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>
                        </span>
                        Step \${index + 1}
                    \`;

                    const actions = document.createElement('div');
                    actions.className = 'step-actions';
                    
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'icon-btn delete';
                    deleteBtn.title = 'Remove Step';
                    deleteBtn.innerHTML = '<svg class="icon" viewBox="0 0 16 16"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.75 1.75 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>';
                    deleteBtn.onclick = () => removeStep(index);

                    actions.appendChild(deleteBtn);
                    header.appendChild(title);
                    header.appendChild(actions);

                    // Content
                    const content = document.createElement('div');
                    content.className = 'step-content';

                    // Directory Input
                    const dirGroup = document.createElement('div');
                    dirGroup.className = 'field-group';
                    const dirLabel = document.createElement('label');
                    dirLabel.textContent = 'Directory';
                    const dirInput = document.createElement('input');
                    dirInput.type = 'text';
                    dirInput.value = step.directory;
                    dirInput.placeholder = '.';
                    dirInput.oninput = (e) => updateStep(index, 'directory', e.target.value);
                    dirGroup.appendChild(dirLabel);
                    dirGroup.appendChild(dirInput);

                    // Command Input
                    const cmdGroup = document.createElement('div');
                    cmdGroup.className = 'field-group';
                    const cmdLabel = document.createElement('label');
                    cmdLabel.textContent = 'Command';
                    const cmdInput = document.createElement('input');
                    cmdInput.type = 'text';
                    cmdInput.value = step.command;
                    cmdInput.placeholder = 'npm install';
                    cmdInput.oninput = (e) => updateStep(index, 'command', e.target.value);
                    cmdGroup.appendChild(cmdLabel);
                    cmdGroup.appendChild(cmdInput);

                    // Terminal selection for this step (optional)
                    const termGroup = document.createElement('div');
                    termGroup.className = 'field-group';
                    const termLabel = document.createElement('label');
                    termLabel.textContent = 'Terminal (optional)';
                    const termSelect = document.createElement('select');
                    ['Default', 'PowerShell', 'Git Bash', 'Bash', 'Cmd'].forEach(opt => {
                        const o = document.createElement('option');
                        o.value = opt;
                        o.textContent = opt;
                        termSelect.appendChild(o);
                    });
                    termSelect.value = step.terminal || state.defaultTerminal || 'Default';
                    termSelect.onchange = (e) => updateStep(index, 'terminal', e.target.value);
                    termGroup.appendChild(termLabel);
                    termGroup.appendChild(termSelect);

                    // Terminal name (to reuse or identify)
                    const tnameGroup = document.createElement('div');
                    tnameGroup.className = 'field-group';
                    const tnameLabel = document.createElement('label');
                    tnameLabel.textContent = 'Terminal Name (optional)';
                    const tnameInput = document.createElement('input');
                    tnameInput.type = 'text';
                    tnameInput.value = step.terminalName || '';
                    tnameInput.placeholder = '';
                    tnameInput.oninput = (e) => updateStep(index, 'terminalName', e.target.value);
                    tnameGroup.appendChild(tnameLabel);
                    tnameGroup.appendChild(tnameInput);

                    content.appendChild(dirGroup);
                    content.appendChild(cmdGroup);
                    content.appendChild(termGroup);
                    content.appendChild(tnameGroup);

                    li.appendChild(header);
                    li.appendChild(content);

                    // Drag Events
                    li.addEventListener('dragstart', handleDragStart);
                    li.addEventListener('dragover', handleDragOver);
                    li.addEventListener('drop', handleDrop);
                    li.addEventListener('dragend', handleDragEnd);

                    stepsList.appendChild(li);
                });
            }
        }

        // State Management
        function addStep() {
            const lastStep = state.steps[state.steps.length - 1];
            const newDir = lastStep ? lastStep.directory : '.';
            state.steps.push({ directory: newDir, command: '', terminal: state.defaultTerminal || 'Default', terminalName: '' });
            renderSteps();
            // Scroll to bottom
            setTimeout(() => {
                window.scrollTo(0, document.body.scrollHeight);
                const inputs = stepsList.querySelectorAll('input');
                if (inputs.length) inputs[inputs.length - 1].focus();
            }, 50);
        }

        function removeStep(index) {
            state.steps.splice(index, 1);
            renderSteps();
        }

        function updateStep(index, field, value) {
            state.steps[index][field] = value;
        }

        // Drag and Drop Logic
        let dragSrcEl = null;

        function handleDragStart(e) {
            this.style.opacity = '0.4';
            dragSrcEl = this;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', this.innerHTML);
        }

        function handleDragOver(e) {
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.dataTransfer.dropEffect = 'move';
            return false;
        }

        function handleDrop(e) {
            if (e.stopPropagation) {
                e.stopPropagation();
            }
            
            if (dragSrcEl !== this) {
                const srcIndex = parseInt(dragSrcEl.dataset.index);
                const targetIndex = parseInt(this.dataset.index);
                
                // Swap in state
                const temp = state.steps[srcIndex];
                state.steps.splice(srcIndex, 1);
                state.steps.splice(targetIndex, 0, temp);
                
                renderSteps();
            }
            return false;
        }

        function handleDragEnd(e) {
            this.style.opacity = '1';
        }

        // Event Listeners
        addStepBtn.addEventListener('click', addStep);
        
        saveBtn.addEventListener('click', () => {
            const name = seqNameInput.value.trim();
            if (!name) {
                vscode.postMessage({ type: 'error', message: 'Sequence name is required' });
                return;
            }
            if (state.steps.length === 0) {
                vscode.postMessage({ type: 'error', message: 'Add at least one step' });
                return;
            }
            
            state.name = name;
            // Attach default terminal settings to top-level sequence for convenience
            const seqToSave = Object.assign({}, state);
            seqToSave.terminal = state.defaultTerminal;
            delete seqToSave.defaultTerminal;
            vscode.postMessage({ type: 'save', sequence: seqToSave, oldName });
        });

        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'cancel' });
        });

        // Initialize
        init();

    </script>
</body>
</html>`;
    }
}
exports.SequenceEditorManager = SequenceEditorManager;
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=sequenceEditorManager.js.map