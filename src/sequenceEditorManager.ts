import * as vscode from "vscode";
import {
  CommandSequence,
  CommandSequenceProvider,
} from "./commandSequenceProvider";

export class SequenceEditorManager {
  public static currentPanel: SequenceEditorManager | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private provider: CommandSequenceProvider,
    private initialSequence?: CommandSequence,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "save": {
            const newSeq: CommandSequence = message.sequence;
            const oldName: string | undefined = message.oldName;
            if (oldName && oldName !== newSeq.name) {
              await this.provider.deleteSequence(oldName);
            }
            await this.provider.saveSequence(newSeq);
            vscode.window.showInformationMessage(
              `Saved sequence "${newSeq.name}" with ${newSeq.steps.length} steps`,
            );
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
      },
      null,
      this._disposables,
    );
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    provider: CommandSequenceProvider,
    initial?: CommandSequence,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Allow multiple editors by creating unique panel IDs
    const panelId = initial ? `sequenceEditor-${initial.name}` : `sequenceEditor-new-${Date.now()}`;

    const panel = vscode.window.createWebviewPanel(
      panelId,
      initial ? `Edit: ${initial.name}` : "New Command Sequence",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      },
    );

    // Don't track single panel - allow multiple
    new SequenceEditorManager(panel, extensionUri, provider, initial);
  }

  public dispose() {
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
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
            --container-padding: 20px;
            --input-padding-vertical: 10px;
            --input-padding-horizontal: 12px;
            --border-radius: 6px;
            --transition: all 0.2s ease;
        }

        * {
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: var(--container-padding);
            margin: 0;
            line-height: 1.5;
        }

        h1 {
            font-size: 1.4rem;
            font-weight: 600;
            margin-bottom: 24px;
            color: var(--vscode-editor-foreground);
            display: flex;
            align-items: center;
            gap: 10px;
        }

        h1::before {
            content: "⚡";
            font-size: 1.2rem;
        }

        .form-group {
            margin-bottom: 24px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--vscode-foreground);
            font-size: 0.9rem;
        }

        input[type="text"], select {
            width: 100%;
            padding: var(--input-padding-vertical) var(--input-padding-horizontal);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: var(--border-radius);
            outline: none;
            font-size: 0.95rem;
            transition: var(--transition);
        }

        input[type="text"]:focus, select:focus {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px var(--vscode-focusBorder);
        }

        select {
            cursor: pointer;
        }

        .two-column {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }

        .steps-container {
            margin-top: 24px;
        }

        .steps-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }

        .steps-header label {
            margin: 0;
            font-size: 1rem;
        }

        .step-count {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 0.85rem;
            font-weight: 600;
        }

        .step-list {
            list-style-type: none;
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .step-item {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-widget-border);
            border-radius: var(--border-radius);
            padding: 16px;
            position: relative;
            transition: var(--transition);
        }

        .step-item:hover {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .step-item.dragging {
            opacity: 0.6;
            border-style: dashed;
            border-color: var(--vscode-focusBorder);
        }

        .step-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .step-number {
            font-weight: 700;
            font-size: 0.9rem;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .step-number::before {
            content: "📋";
        }

        .step-actions {
            display: flex;
            gap: 6px;
        }

        .icon-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            cursor: pointer;
            padding: 6px 10px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: var(--transition);
            font-size: 0.85rem;
        }

        .icon-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .icon-btn.delete {
            background-color: transparent;
            color: var(--vscode-errorForeground);
        }

        .icon-btn.delete:hover {
            background-color: var(--vscode-errorForeground);
            color: var(--vscode-button-foreground);
        }

        .icon-btn.move {
            background-color: transparent;
            color: var(--vscode-foreground);
            cursor: grab;
        }

        .icon-btn.move:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }

        .step-content {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }

        .field-group {
            display: flex;
            flex-direction: column;
        }

        .field-group.full-width {
            grid-column: 1 / -1;
        }

        .field-group label {
            font-size: 0.8rem;
            margin-bottom: 6px;
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
        }

        .field-group input, .field-group select {
            font-size: 0.9rem;
        }

        .actions-bar {
            margin-top: 24px;
            display: flex;
            gap: 12px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-widget-border);
            position: sticky;
            bottom: 0;
            background-color: var(--vscode-editor-background);
        }

        button {
            padding: 10px 20px;
            border-radius: var(--border-radius);
            border: none;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.95rem;
            transition: var(--transition);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        button.success {
            background-color: var(--vscode-testing-iconPassed);
            color: white;
        }

        button.success:hover {
            opacity: 0.9;
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
            border: 2px dashed var(--vscode-widget-border);
            border-radius: var(--border-radius);
            margin-bottom: 16px;
        }

        .empty-state-icon {
            font-size: 3rem;
            margin-bottom: 12px;
        }

        .empty-state-text {
            font-size: 1rem;
            margin-bottom: 16px;
        }

        .info-box {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-left: 4px solid var(--vscode-focusBorder);
            padding: 12px 16px;
            margin-bottom: 20px;
            border-radius: 0 var(--border-radius) var(--border-radius) 0;
            font-size: 0.9rem;
            color: var(--vscode-descriptionForeground);
        }

        .info-box strong {
            color: var(--vscode-foreground);
        }

        /* Scrollbar styling */
        ::-webkit-scrollbar {
            width: 10px;
            height: 10px;
        }

        ::-webkit-scrollbar-track {
            background: var(--vscode-scrollbarSlider-background);
        }

        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-hoverBackground);
            border-radius: 5px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-activeBackground);
        }
    </style>
</head>
<body>
    <h1 id="page-title">Create New Command Sequence</h1>
    
    <div class="info-box">
        <strong>💡 Tip:</strong> Each step runs in the specified directory. Use <code>.</code> for workspace root. 
        You can choose different terminals for each step or use the sequence default.
    </div>

    <div class="form-group">
        <label for="seqName">Sequence Name *</label>
        <input type="text" id="seqName" placeholder="e.g., Build and Deploy" />
    </div>

    <div class="form-group two-column">
        <div>
            <label for="defaultTerminal">Default Terminal</label>
            <select id="defaultTerminal">
                <option value="Default">Default (VS Code Setting)</option>
                <option value="PowerShell">PowerShell</option>
                <option value="Git Bash">Git Bash</option>
                <option value="Bash">Bash</option>
                <option value="Zsh">Zsh</option>
                <option value="Cmd">Command Prompt</option>
            </select>
        </div>
        <div>
            <label for="terminalName">Terminal Name (optional)</label>
            <input type="text" id="terminalName" placeholder="e.g., Build Terminal" />
        </div>
    </div>

    <div class="steps-container">
        <div class="steps-header">
            <label>Command Steps</label>
            <span id="stepCount" class="step-count">0 steps</span>
        </div>
        
        <div id="stepsList" class="step-list">
            <!-- Steps will be injected here -->
        </div>
        
        <div id="emptyState" class="empty-state">
            <div class="empty-state-icon">📝</div>
            <div class="empty-state-text">No steps added yet</div>
            <button id="addStepBtnEmpty" class="success">+ Add First Step</button>
        </div>
    </div>

    <div class="actions-bar">
        <button id="addStepBtn" class="success">+ Add Step</button>
        <div style="flex: 1;"></div>
        <button id="saveBtn" class="primary">💾 Save Sequence</button>
        <button id="cancelBtn" class="secondary">❌ Cancel</button>
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
        const pageTitle = document.getElementById('page-title');
        const seqNameInput = document.getElementById('seqName');
        const defaultTerminalSelect = document.getElementById('defaultTerminal');
        const terminalNameInput = document.getElementById('terminalName');
        const stepsList = document.getElementById('stepsList');
        const emptyState = document.getElementById('emptyState');
        const stepCount = document.getElementById('stepCount');
        const addStepBtn = document.getElementById('addStepBtn');
        const addStepBtnEmpty = document.getElementById('addStepBtnEmpty');
        const saveBtn = document.getElementById('saveBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        // Initialization
        function init() {
            pageTitle.textContent = initialData ? '✏️ Edit Command Sequence' : '⚡ Create New Command Sequence';
            seqNameInput.value = state.name;
            defaultTerminalSelect.value = state.defaultTerminal;
            terminalNameInput.value = state.terminalName;
            renderSteps();
        }

        // Update step count
        function updateStepCount() {
            const count = state.steps.length;
            stepCount.textContent = count === 1 ? '1 step' : count + ' steps';
        }

        // Render Steps
        function renderSteps() {
            stepsList.innerHTML = '';
            updateStepCount();
            
            if (state.steps.length === 0) {
                emptyState.style.display = 'block';
                stepsList.style.display = 'none';
            } else {
                emptyState.style.display = 'none';
                stepsList.style.display = 'flex';
                
                state.steps.forEach((step, index) => {
                    const stepEl = createStepElement(step, index);
                    stepsList.appendChild(stepEl);
                });
            }
        }

        function createStepElement(step, index) {
            const div = document.createElement('div');
            div.className = 'step-item';
            div.draggable = true;
            div.dataset.index = index;

            // Header
            const header = document.createElement('div');
            header.className = 'step-header';
            
            const title = document.createElement('span');
            title.className = 'step-number';
            title.textContent = 'Step ' + (index + 1);

            const actions = document.createElement('div');
            actions.className = 'step-actions';
            
            // Move up button
            if (index > 0) {
                const moveUpBtn = document.createElement('button');
                moveUpBtn.className = 'icon-btn move';
                moveUpBtn.title = 'Move Up';
                moveUpBtn.innerHTML = '↑';
                moveUpBtn.onclick = () => moveStep(index, index - 1);
                actions.appendChild(moveUpBtn);
            }
            
            // Move down button
            if (index < state.steps.length - 1) {
                const moveDownBtn = document.createElement('button');
                moveDownBtn.className = 'icon-btn move';
                moveDownBtn.title = 'Move Down';
                moveDownBtn.innerHTML = '↓';
                moveDownBtn.onclick = () => moveStep(index, index + 1);
                actions.appendChild(moveDownBtn);
            }
            
            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'icon-btn delete';
            deleteBtn.title = 'Remove Step';
            deleteBtn.innerHTML = '🗑️';
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
            dirLabel.textContent = '📁 Directory';
            const dirInput = document.createElement('input');
            dirInput.type = 'text';
            dirInput.value = step.directory;
            dirInput.placeholder = '.';
            dirInput.oninput = (e) => updateStep(index, 'directory', e.target.value);
            dirGroup.appendChild(dirLabel);
            dirGroup.appendChild(dirInput);

            // Command Input
            const cmdGroup = document.createElement('div');
            cmdGroup.className = 'field-group full-width';
            const cmdLabel = document.createElement('label');
            cmdLabel.textContent = '⚡ Command';
            const cmdInput = document.createElement('input');
            cmdInput.type = 'text';
            cmdInput.value = step.command;
            cmdInput.placeholder = 'npm install';
            cmdInput.oninput = (e) => updateStep(index, 'command', e.target.value);
            cmdGroup.appendChild(cmdLabel);
            cmdGroup.appendChild(cmdInput);

            // Terminal selection for this step
            const termGroup = document.createElement('div');
            termGroup.className = 'field-group';
            const termLabel = document.createElement('label');
            termLabel.textContent = '🖥️ Terminal (optional)';
            const termSelect = document.createElement('select');
            [
                { value: '', label: 'Use Sequence Default' },
                { value: 'Default', label: 'Default' },
                { value: 'PowerShell', label: 'PowerShell' },
                { value: 'Git Bash', label: 'Git Bash' },
                { value: 'Bash', label: 'Bash' },
                { value: 'Zsh', label: 'Zsh' },
                { value: 'Cmd', label: 'Command Prompt' }
            ].forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label;
                termSelect.appendChild(o);
            });
            termSelect.value = step.terminal || '';
            termSelect.onchange = (e) => updateStep(index, 'terminal', e.target.value);
            termGroup.appendChild(termLabel);
            termGroup.appendChild(termSelect);

            // Terminal name for this step
            const tnameGroup = document.createElement('div');
            tnameGroup.className = 'field-group';
            const tnameLabel = document.createElement('label');
            tnameLabel.textContent = '🏷️ Terminal Name (optional)';
            const tnameInput = document.createElement('input');
            tnameInput.type = 'text';
            tnameInput.value = step.terminalName || '';
            tnameInput.placeholder = 'e.g., Frontend Build';
            tnameInput.oninput = (e) => updateStep(index, 'terminalName', e.target.value);
            tnameGroup.appendChild(tnameLabel);
            tnameGroup.appendChild(tnameInput);

            content.appendChild(dirGroup);
            content.appendChild(termGroup);
            content.appendChild(cmdGroup);
            content.appendChild(tnameGroup);

            div.appendChild(header);
            div.appendChild(content);

            // Drag Events
            div.addEventListener('dragstart', handleDragStart);
            div.addEventListener('dragover', handleDragOver);
            div.addEventListener('drop', handleDrop);
            div.addEventListener('dragend', handleDragEnd);

            return div;
        }

        // State Management
        function addStep() {
            const lastStep = state.steps[state.steps.length - 1];
            const newDir = lastStep ? lastStep.directory : '.';
            state.steps.push({ 
                directory: newDir, 
                command: '', 
                terminal: '', 
                terminalName: '' 
            });
            renderSteps();
            // Scroll to bottom and focus the new command input
            setTimeout(() => {
                window.scrollTo(0, document.body.scrollHeight);
                const inputs = stepsList.querySelectorAll('input[type="text"]');
                if (inputs.length) {
                    // Focus on the last command input (every 4th input starting from index 1)
                    const lastCmdInput = inputs[inputs.length - 2]; // -2 because terminal name is last
                    if (lastCmdInput) lastCmdInput.focus();
                }
            }, 50);
        }

        function removeStep(index) {
            state.steps.splice(index, 1);
            renderSteps();
        }

        function moveStep(fromIndex, toIndex) {
            const temp = state.steps[fromIndex];
            state.steps.splice(fromIndex, 1);
            state.steps.splice(toIndex, 0, temp);
            renderSteps();
        }

        function updateStep(index, field, value) {
            state.steps[index][field] = value;
        }

        // Drag and Drop Logic
        let dragSrcEl = null;

        function handleDragStart(e) {
            this.classList.add('dragging');
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
            this.classList.remove('dragging');
        }

        // Event Listeners
        addStepBtn.addEventListener('click', addStep);
        addStepBtnEmpty.addEventListener('click', addStep);
        
        saveBtn.addEventListener('click', () => {
            const name = seqNameInput.value.trim();
            if (!name) {
                vscode.postMessage({ type: 'error', message: 'Sequence name is required' });
                seqNameInput.focus();
                return;
            }
            
            // Validate steps
            for (let i = 0; i < state.steps.length; i++) {
                const step = state.steps[i];
                if (!step.command.trim()) {
                    vscode.postMessage({ type: 'error', message: 'Step ' + (i + 1) + ' is missing a command' });
                    return;
                }
                if (!step.directory.trim()) {
                    step.directory = '.';
                }
            }
            
            if (state.steps.length === 0) {
                vscode.postMessage({ type: 'error', message: 'Add at least one step' });
                return;
            }
            
            state.name = name;
            state.terminal = defaultTerminalSelect.value;
            state.terminalName = terminalNameInput.value.trim();
            
            // Clean up empty terminal values
            state.steps.forEach(step => {
                if (!step.terminal) delete step.terminal;
                if (!step.terminalName) delete step.terminalName;
            });
            
            vscode.postMessage({ type: 'save', sequence: state, oldName });
        });

        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'cancel' });
        });

        // Handle Enter key in sequence name to add first step
        seqNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && state.steps.length === 0) {
                addStep();
            }
        });

        // Initialize
        init();
    </script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
