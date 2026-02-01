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
        const panelId = initial
            ? `sequenceEditor-${initial.name}`
            : `sequenceEditor-new-${Date.now()}`;
        const panel = vscode.window.createWebviewPanel(panelId, initial ? `Edit: ${initial.name}` : "New Sequence", column || vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
        });
        new SequenceEditorManager(panel, extensionUri, provider, initial);
    }
    dispose() {
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
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sequence Editor</title>
    <style>
        :root {
            --gap-sm: 8px;
            --gap-md: 16px;
            --gap-lg: 24px;
            --radius: 4px;
        }

        * { box-sizing: border-box; }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
            line-height: 1.5;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            padding-bottom: 80px; /* Space for sticky footer */
        }

        /* Typography */
        h1 {
            font-size: 18px;
            font-weight: 500;
            margin: 0 0 24px 0;
            display: flex;
            align-items: center;
            gap: 10px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-settings-headerBorder);
        }

        h2 {
            font-size: 14px;
            text-transform: uppercase;
            font-weight: 600;
            margin: 32px 0 16px 0;
            opacity: 0.8;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        /* Form Elements */
        label {
            display: block;
            margin-bottom: 6px;
            font-size: 13px;
            font-weight: 500;
            color: var(--vscode-input-placeholderForeground);
        }

        input[type="text"], select {
            width: 100%;
            padding: 7px 10px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-family: inherit;
            font-size: 13px;
            outline: none;
        }

        input[type="text"]:focus, select:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
        }
        
        input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        .form-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: var(--gap-md);
            margin-bottom: var(--gap-md);
        }
        
        .full-width { grid-column: 1 / -1; }

        /* Step Cards */
        .step-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .step-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: var(--radius);
            display: flex;
            flex-direction: column;
            transition: border-color 0.2s;
            position: relative;
        }

        .step-card:hover {
            border-color: var(--vscode-focusBorder);
        }

        .step-card.dragging {
            opacity: 0.5;
            border-style: dashed;
        }

        .step-header {
            background-color: var(--vscode-sideBar-background);
            padding: 8px 12px;
            display: flex;
            align-items: center;
            border-bottom: 1px solid var(--vscode-widget-border);
            border-radius: var(--radius) var(--radius) 0 0;
            gap: 10px;
        }

        .drag-handle {
            cursor: grab;
            color: var(--vscode-icon-foreground);
            opacity: 0.6;
            display: flex;
            align-items: center;
        }
        
        .drag-handle:hover { opacity: 1; }

        .step-title {
            font-weight: 600;
            font-size: 12px;
            flex: 1;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .step-actions {
            display: flex;
            gap: 4px;
        }

        .icon-btn {
            background: transparent;
            border: none;
            color: var(--vscode-icon-foreground);
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

        .step-body {
            padding: 16px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }

        .input-group {
            display: flex;
            flex-direction: column;
        }

        /* SVG Icons */
        svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
        }
        
        /* Sticky Footer */
        .footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 16px 20px;
            background-color: var(--vscode-editor-background);
            border-top: 1px solid var(--vscode-widget-border);
            display: flex;
            gap: 12px;
            z-index: 10;
            box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
        }

        button.primary, button.secondary {
            padding: 6px 14px;
            border: none;
            border-radius: 2px;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            font-family: inherit;
        }

        button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .spacer { flex: 1; }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
            border: 1px dashed var(--vscode-widget-border);
            border-radius: var(--radius);
        }

        .helper-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
    </style>
</head>
<body>
    <svg style="display:none">
        <symbol id="icon-add" viewBox="0 0 16 16"><path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/></symbol>
        <symbol id="icon-trash" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5v1h-14v-1h3.5v-1h7zm-9 3h11v10h-11v-10zm2 2v6h1v-6h-1zm4 0v6h1v-6h-1z"/></symbol>
        <symbol id="icon-save" viewBox="0 0 16 16"><path d="M12.91 2.38L11.53 1H2.5A1.5 1.5 0 0 0 1 2.5V14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4.57a1 1 0 0 0-.29-.71l-1.8-1.48zM5 2h5v3H5V2zM3 2.5a.5.5 0 0 1 .5-.5h.5v4h7v-4h.34l1.66 1.37V14a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2.5zM12 13H4v-4h8v4z"/></symbol>
        <symbol id="icon-close" viewBox="0 0 16 16"><path d="M8 7.29L2.35 1.65 1.65 2.35 7.29 8l-5.64 5.65.7.7L8 8.71l5.65 5.64.7-.7L8.71 8l5.64-5.65-.7-.7L8 7.29z"/></symbol>
        <symbol id="icon-arrow-up" viewBox="0 0 16 16"><path d="M3.5 8.5l4.5-4.5 4.5 4.5-.7.71L8.5 5.92V14H7.5V5.92L4.21 9.21 3.5 8.5zM8 1h1v2H8V1z"/></symbol>
        <symbol id="icon-arrow-down" viewBox="0 0 16 16"><path d="M3.5 7.5l4.5 4.5 4.5-4.5-.7-.71L8.5 10.08V2H7.5v8.08L4.21 6.79 3.5 7.5zM8 15h1v-2H8v2z"/></symbol>
        <symbol id="icon-drag" viewBox="0 0 16 16"><path d="M6 4h1V2H6v2zm0 5h1V7H6v2zm0 5h1v-2H6v2zM9 4h1V2H9v2zm0 5h1V7H9v2zm0 5h1v-2H9v2z"/></symbol>
        <symbol id="icon-terminal" viewBox="0 0 16 16"><path d="M2 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H2zm12 10H2V4h12v8zM4 6h2v1H4V6zm0 2h4v1H4V8z"/></symbol>
        <symbol id="icon-folder" viewBox="0 0 16 16"><path d="M7 2l2 2h5v9H2V2h5zM2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-4.5L7 1H2z"/></symbol>
        <symbol id="icon-play" viewBox="0 0 16 16"><path d="M3 2l10 6-10 6z"/></symbol>
        <symbol id="icon-settings" viewBox="0 0 16 16"><path d="M9.1 13.4l.7-.7-1.1-3 1.4-1.4 3 1.1.7-.7-1.8-4.2-4.2-1.8-.7.7 1.1 3-1.4 1.4-3-1.1-.7.7 1.8 4.2 4.2 1.8zM4.6 6.1l2.5 1-1.5 1.5-1-2.5zm6.8 3.8l-2.5-1 1.5-1.5 1 2.5z"/></symbol>
    </svg>

    <div class="container">
        <h1 id="page-title">
            <svg><use href="#icon-settings"></use></svg>
            <span>Command Sequence Editor</span>
        </h1>

        <div class="form-grid">
            <div class="input-group">
                <label for="seqName">Sequence Name</label>
                <input type="text" id="seqName" placeholder="e.g. Build and Deploy Project" />
            </div>
            <div class="input-group">
                <label>Terminal Strategy</label>
                <select id="defaultTerminal">
                    <option value="Default">VS Code Default</option>
                    <option value="PowerShell">PowerShell</option>
                    <option value="Git Bash">Git Bash</option>
                    <option value="Bash">Bash</option>
                    <option value="Zsh">Zsh</option>
                    <option value="Cmd">Command Prompt</option>
                </select>
            </div>
            <div class="input-group full-width">
                <label for="terminalName">Shared Terminal Name <span style="font-weight:400; opacity:0.7">(Optional)</span></label>
                <input type="text" id="terminalName" placeholder="e.g. My Build Task" />
                <div class="helper-text">If set, all steps will reuse this specific terminal instance.</div>
            </div>
        </div>

        <h2>
            <span>Execution Steps</span>
            <span id="stepCount" style="font-weight:400; font-size:12px; opacity:0.7">0 Steps</span>
        </h2>

        <div id="stepsList" class="step-list">
            </div>

        <div id="emptyState" class="empty-state" style="display:none">
            <div style="margin-bottom:12px; opacity:0.5"><svg style="width:32px; height:32px"><use href="#icon-play"></use></svg></div>
            <div>No commands defined yet.</div>
            <div style="margin-top:12px">
                <button id="addStepBtnEmpty" class="secondary" style="margin: 0 auto">
                    <svg><use href="#icon-add"></use></svg> Add First Step
                </button>
            </div>
        </div>
    </div>

    <div class="footer">
        <button id="addStepBtn" class="secondary">
            <svg><use href="#icon-add"></use></svg> Add Step
        </button>
        <div class="spacer"></div>
        <button id="cancelBtn" class="secondary">
            <svg><use href="#icon-close"></use></svg> Cancel
        </button>
        <button id="saveBtn" class="primary">
            <svg><use href="#icon-save"></use></svg> Save Sequence
        </button>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const initialData = ${initialData};
        
        let state = {
            name: initialData ? initialData.name : '',
            steps: initialData ? initialData.steps : [],
            defaultTerminal: initialData ? (initialData.terminal || 'Default') : 'Default',
            terminalName: initialData ? (initialData.terminalName || '') : ''
        };
        
        const oldName = initialData ? initialData.name : undefined;

        // Elements
        const seqNameInput = document.getElementById('seqName');
        const defaultTerminalSelect = document.getElementById('defaultTerminal');
        const terminalNameInput = document.getElementById('terminalName');
        const stepsList = document.getElementById('stepsList');
        const emptyState = document.getElementById('emptyState');
        const stepCount = document.getElementById('stepCount');
        
        // Buttons
        const addStepBtn = document.getElementById('addStepBtn');
        const addStepBtnEmpty = document.getElementById('addStepBtnEmpty');
        const saveBtn = document.getElementById('saveBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        function init() {
            seqNameInput.value = state.name;
            defaultTerminalSelect.value = state.defaultTerminal;
            terminalNameInput.value = state.terminalName;
            renderSteps();
        }

        function renderSteps() {
            stepsList.innerHTML = '';
            stepCount.textContent = state.steps.length + ' Step' + (state.steps.length !== 1 ? 's' : '');
            
            if (state.steps.length === 0) {
                emptyState.style.display = 'block';
                stepsList.style.display = 'none';
            } else {
                emptyState.style.display = 'none';
                stepsList.style.display = 'flex';
                state.steps.forEach((step, index) => {
                    stepsList.appendChild(createStepElement(step, index));
                });
            }
        }

        function createStepElement(step, index) {
            const card = document.createElement('div');
            card.className = 'step-card';
            card.draggable = true;
            card.dataset.index = index;

            // Header
            const header = document.createElement('div');
            header.className = 'step-header';
            
            const dragHandle = document.createElement('div');
            dragHandle.className = 'drag-handle';
            dragHandle.title = 'Drag to reorder';
            dragHandle.innerHTML = '<svg><use href="#icon-drag"></use></svg>';
            
            const title = document.createElement('div');
            title.className = 'step-title';
            title.textContent = 'Step ' + (index + 1);
            
            const actions = document.createElement('div');
            actions.className = 'step-actions';
            
            // Reorder Buttons (for keyboard/accessibility users mainly, but useful visually)
            if (index > 0) {
                const upBtn = document.createElement('button');
                upBtn.className = 'icon-btn';
                upBtn.title = 'Move Up';
                upBtn.innerHTML = '<svg><use href="#icon-arrow-up"></use></svg>';
                upBtn.onclick = () => moveStep(index, index - 1);
                actions.appendChild(upBtn);
            }
            if (index < state.steps.length - 1) {
                const downBtn = document.createElement('button');
                downBtn.className = 'icon-btn';
                downBtn.title = 'Move Down';
                downBtn.innerHTML = '<svg><use href="#icon-arrow-down"></use></svg>';
                downBtn.onclick = () => moveStep(index, index + 1);
                actions.appendChild(downBtn);
            }
            
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn delete';
            delBtn.title = 'Delete Step';
            delBtn.innerHTML = '<svg><use href="#icon-trash"></use></svg>';
            delBtn.onclick = () => removeStep(index);
            
            actions.appendChild(delBtn);
            header.appendChild(dragHandle);
            header.appendChild(title);
            header.appendChild(actions);

            // Body
            const body = document.createElement('div');
            body.className = 'step-body';

            // Row 1: Command (Full Width)
            const cmdGroup = document.createElement('div');
            cmdGroup.className = 'input-group full-width';
            cmdGroup.style.marginBottom = '12px';
            const cmdLabel = document.createElement('label');
            cmdLabel.innerHTML = 'Command';
            const cmdInput = document.createElement('input');
            cmdInput.type = 'text';
            cmdInput.value = step.command;
            cmdInput.placeholder = 'e.g. npm install';
            cmdInput.oninput = (e) => updateStep(index, 'command', e.target.value);
            cmdGroup.appendChild(cmdLabel);
            cmdGroup.appendChild(cmdInput);

            // Row 2: Directory
            const dirGroup = document.createElement('div');
            dirGroup.className = 'input-group';
            const dirLabel = document.createElement('label');
            dirLabel.textContent = 'Directory';
            const dirInput = document.createElement('input');
            dirInput.type = 'text';
            dirInput.value = step.directory;
            dirInput.placeholder = '.';
            dirInput.title = 'Use . for workspace root';
            dirInput.oninput = (e) => updateStep(index, 'directory', e.target.value);
            dirGroup.appendChild(dirLabel);
            dirGroup.appendChild(dirInput);

            // Row 2: Terminal
            const termGroup = document.createElement('div');
            termGroup.className = 'input-group';
            const termLabel = document.createElement('label');
            termLabel.textContent = 'Terminal Override';
            const termSelect = document.createElement('select');
            
            const opts = [
                {v: '', l: 'Inherit Default'},
                {v: 'Default', l: 'VS Code Default'},
                {v: 'PowerShell', l: 'PowerShell'},
                {v: 'Git Bash', l: 'Git Bash'},
                {v: 'Bash', l: 'Bash'},
                {v: 'Zsh', l: 'Zsh'},
                {v: 'Cmd', l: 'Cmd Prompt'}
            ];
            
            opts.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.v;
                opt.textContent = o.l;
                termSelect.appendChild(opt);
            });
            termSelect.value = step.terminal || '';
            termSelect.onchange = (e) => updateStep(index, 'terminal', e.target.value);
            termGroup.appendChild(termLabel);
            termGroup.appendChild(termSelect);

            body.appendChild(cmdGroup);
            body.appendChild(dirGroup);
            body.appendChild(termGroup);

            card.appendChild(header);
            card.appendChild(body);

            // Drag Events
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragover', handleDragOver);
            card.addEventListener('drop', handleDrop);
            card.addEventListener('dragend', handleDragEnd);

            return card;
        }

        // Logic
        function addStep() {
            const lastStep = state.steps[state.steps.length - 1];
            state.steps.push({
                directory: lastStep ? lastStep.directory : '.',
                command: '',
                terminal: ''
            });
            renderSteps();
            setTimeout(() => {
                window.scrollTo(0, document.body.scrollHeight);
                const inputs = stepsList.querySelectorAll('input[type="text"]');
                // Focus the new command input
                if(inputs.length > 2) inputs[inputs.length - 3].focus(); 
            }, 50);
        }

        function removeStep(index) {
            state.steps.splice(index, 1);
            renderSteps();
        }

        function moveStep(from, to) {
            const temp = state.steps[from];
            state.steps.splice(from, 1);
            state.steps.splice(to, 0, temp);
            renderSteps();
        }

        function updateStep(index, field, value) {
            state.steps[index][field] = value;
        }

        // Drag & Drop
        let dragSrc = null;

        function handleDragStart(e) {
            this.classList.add('dragging');
            dragSrc = this;
            e.dataTransfer.effectAllowed = 'move';
        }

        function handleDragOver(e) {
            if (e.preventDefault) e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            return false;
        }

        function handleDrop(e) {
            if (e.stopPropagation) e.stopPropagation();
            if (dragSrc !== this) {
                const srcIdx = parseInt(dragSrc.dataset.index);
                const tgtIdx = parseInt(this.dataset.index);
                moveStep(srcIdx, tgtIdx);
            }
            return false;
        }

        function handleDragEnd() {
            this.classList.remove('dragging');
        }

        // Listeners
        addStepBtn.addEventListener('click', addStep);
        addStepBtnEmpty.addEventListener('click', addStep);
        
        saveBtn.addEventListener('click', () => {
            const name = seqNameInput.value.trim();
            if (!name) {
                vscode.postMessage({ type: 'error', message: 'Please provide a Sequence Name' });
                seqNameInput.focus();
                return;
            }
            
            for (let i = 0; i < state.steps.length; i++) {
                if (!state.steps[i].command.trim()) {
                    vscode.postMessage({ type: 'error', message: \`Step \${i + 1} is missing a command\` });
                    return;
                }
            }
            
            if (state.steps.length === 0) {
                vscode.postMessage({ type: 'error', message: 'Add at least one step' });
                return;
            }

            state.name = name;
            state.defaultTerminal = defaultTerminalSelect.value;
            state.terminalName = terminalNameInput.value.trim();

            vscode.postMessage({ type: 'save', sequence: state, oldName });
        });

        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'cancel' });
        });
        
        // Enter key shortcut
        seqNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && state.steps.length === 0) addStep();
        });

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