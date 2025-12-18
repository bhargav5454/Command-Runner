import * as vscode from 'vscode';
import { CommandSequenceProvider, CommandSequence, CommandStep, CommandSequenceItem } from './commandSequenceProvider';
import { CommandExecutor } from './commandExecutor';

let sequenceProvider: CommandSequenceProvider;
let executor: CommandExecutor;

export function activate(context: vscode.ExtensionContext) {
    console.log('Command Runner extension is now active');

    // Initialize provider and executor
    sequenceProvider = new CommandSequenceProvider(context);
    executor = new CommandExecutor();

    // Register tree view
    vscode.window.registerTreeDataProvider('commandSequences', sequenceProvider);

    // Register commands
    const addSequenceCommand = vscode.commands.registerCommand('commandRunner.addSequence', async () => {
        await openSequenceEditor();
    });

    const runSequenceCommand = vscode.commands.registerCommand('commandRunner.runSequence', async (item: CommandSequenceItem) => {
        if (item && 'steps' in item.sequence) {
            await executor.runSequence(item.sequence as CommandSequence);
        } else {
            // Show quick pick if no item selected
            const sequences = sequenceProvider.getSequences();
            if (sequences.length === 0) {
                vscode.window.showInformationMessage('No command sequences found. Add one first!');
                return;
            }

            const selected = await vscode.window.showQuickPick(
                sequences.map(s => ({ label: s.name, sequence: s })),
                { placeHolder: 'Select a sequence to run' }
            );

            if (selected) {
                await executor.runSequence(selected.sequence);
            }
        }
    });

    const deleteSequenceCommand = vscode.commands.registerCommand('commandRunner.deleteSequence', async (item: CommandSequenceItem) => {
        let sequenceName: string | undefined;

        if (item && 'steps' in item.sequence) {
            sequenceName = (item.sequence as CommandSequence).name;
        } else {
            const sequences = sequenceProvider.getSequences();
            const selected = await vscode.window.showQuickPick(
                sequences.map(s => s.name),
                { placeHolder: 'Select a sequence to delete' }
            );
            sequenceName = selected;
        }

        if (sequenceName) {
            const confirm = await vscode.window.showWarningMessage(
                `Delete sequence "${sequenceName}"?`,
                'Yes', 'No'
            );

            if (confirm === 'Yes') {
                await sequenceProvider.deleteSequence(sequenceName);
                vscode.window.showInformationMessage(`Deleted sequence: ${sequenceName}`);
            }
        }
    });

    const manageSequencesCommand = vscode.commands.registerCommand('commandRunner.manageSequences', async () => {
        const sequences = sequenceProvider.getSequences();
        
        if (sequences.length === 0) {
            vscode.window.showInformationMessage('No command sequences found. Add one first!');
            return;
        }

        const options = sequences.map(s => ({
            label: s.name,
            description: `${s.steps.length} steps`,
            sequence: s
        }));

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: 'Select a sequence to view or edit'
        });

        if (selected) {
            const action = await vscode.window.showQuickPick(
                ['Run', 'Edit', 'Delete', 'View Steps'],
                { placeHolder: `What do you want to do with "${selected.label}"?` }
            );

            switch (action) {
                case 'Run':
                    await executor.runSequence(selected.sequence);
                    break;
                case 'Edit':
                    await openSequenceEditor(selected.sequence);
                    break;
                case 'Delete':
                    await vscode.commands.executeCommand('commandRunner.deleteSequence');
                    break;
                case 'View Steps':
                    showSequenceSteps(selected.sequence);
                    break;
            }
        }
    });

    // New: Edit Sequence command
    const editSequenceCommand = vscode.commands.registerCommand('commandRunner.editSequence', async (item?: CommandSequenceItem) => {
        let sequence: CommandSequence | undefined;
        if (item && 'steps' in item.sequence) {
            sequence = item.sequence as CommandSequence;
        } else {
            const chosen = await pickSequence('Select a sequence to edit');
            sequence = chosen ?? undefined;
        }
        if (sequence) {
            await openSequenceEditor(sequence);
        }
    });

    // New: Run From This Step
    const runFromStepCommand = vscode.commands.registerCommand('commandRunner.runFromStep', async (item?: CommandSequenceItem) => {
        if (!item || 'steps' in item.sequence) {
            vscode.window.showWarningMessage('Please choose a step to run from.');
            return;
        }
        const step = item.sequence as CommandStep;
        const parentSeqName = item.parentSequenceName;
        if (!parentSeqName) {
            vscode.window.showErrorMessage('Could not determine parent sequence for this step.');
            return;
        }
        const seq = sequenceProvider.getSequences().find(s => s.name === parentSeqName);
        if (!seq) {
            vscode.window.showErrorMessage(`Parent sequence "${parentSeqName}" not found.`);
            return;
        }
        const startIndex = seq.steps.findIndex(s => s === step || (s.command === step.command && s.directory === step.directory));
        if (startIndex < 0) {
            vscode.window.showErrorMessage('Step not found in sequence.');
            return;
        }
        const subSeq: CommandSequence = {
            name: `${seq.name} (from step ${startIndex + 1})`,
            steps: seq.steps.slice(startIndex)
        };
        await executor.runSequence(subSeq);
    });

    // New: Copy Step Command
    const copyStepCommand = vscode.commands.registerCommand('commandRunner.copyStepCommand', async (item?: CommandSequenceItem) => {
        if (!item || 'steps' in item.sequence) {
            vscode.window.showWarningMessage('Please choose a step to copy.');
            return;
        }
        const step = item.sequence as CommandStep;
        await vscode.env.clipboard.writeText(`cd ${step.directory} && ${step.command}`);
        vscode.window.showInformationMessage('Step command copied to clipboard');
    });

    context.subscriptions.push(
        addSequenceCommand,
        runSequenceCommand,
        deleteSequenceCommand,
        manageSequencesCommand,
        editSequenceCommand,
        runFromStepCommand,
        copyStepCommand,
        executor
    );
}

async function addNewSequence(): Promise<void> {
    const name = await vscode.window.showInputBox({
        prompt: 'Enter a name for this command sequence',
        placeHolder: 'e.g., Start Development Server'
    });

    if (!name) {
        return;
    }

    const steps: CommandStep[] = [];
    let addingSteps = true;

    while (addingSteps) {
        const stepNumber = steps.length + 1;
        
        const directory = await vscode.window.showInputBox({
            prompt: `Step ${stepNumber}: Enter directory (relative to workspace root, or use "." for root)`,
            placeHolder: 'e.g., packages/backend or .',
            value: steps.length > 0 ? steps[steps.length - 1].directory : '.'
        });

        if (directory === undefined) {
            break;
        }

        const command = await vscode.window.showInputBox({
            prompt: `Step ${stepNumber}: Enter command to run`,
            placeHolder: 'e.g., yarn install or npm run build'
        });

        if (command === undefined) {
            break;
        }

        steps.push({ directory, command });

        const addMore = await vscode.window.showQuickPick(
            ['Add another step', 'Finish and save'],
            { placeHolder: `Step ${stepNumber} added. What's next?` }
        );

        if (addMore !== 'Add another step') {
            addingSteps = false;
        }
    }

    if (steps.length > 0) {
        const sequence: CommandSequence = { name, steps };
        await sequenceProvider.saveSequence(sequence);
        vscode.window.showInformationMessage(`Saved sequence "${name}" with ${steps.length} steps`);
    } else {
        vscode.window.showWarningMessage('No steps added. Sequence not saved.');
    }
}

async function openSequenceEditor(initial?: CommandSequence): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'sequenceEditor',
        initial ? `Edit Sequence: ${initial.name}` : 'Add New Sequence',
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
        }
    );

    const nonce = getNonce();
    panel.webview.html = getEditorHtml(panel.webview, initial, nonce);

    panel.webview.onDidReceiveMessage(async (message: any) => {
        switch (message.type) {
            case 'save': {
                const newSeq: CommandSequence = message.sequence;
                const oldName: string | undefined = message.oldName;
                if (oldName && oldName !== newSeq.name) {
                    await sequenceProvider.deleteSequence(oldName);
                }
                await sequenceProvider.saveSequence(newSeq);
                vscode.window.showInformationMessage(`Saved sequence "${newSeq.name}" with ${newSeq.steps.length} steps`);
                panel.dispose();
                break;
            }
            case 'cancel': {
                panel.dispose();
                break;
            }
        }
    });
}

function getEditorHtml(webview: vscode.Webview, initial: CommandSequence | undefined, nonce: string): string {
    const initialData = initial ? JSON.stringify(initial) : 'null';
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sequence Editor</title>
    <style>
        body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
        h1 { font-size: 18px; margin: 0 0 12px; }
        .field { margin-bottom: 12px; }
        .label { display: block; margin-bottom: 4px; font-weight: 600; }
        input[type="text"] { width: 100%; padding: 6px 8px; box-sizing: border-box; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
        .steps { margin-top: 16px; }
        .step { border: 1px solid var(--vscode-input-border); padding: 12px; border-radius: 6px; margin-bottom: 10px; }
        .step-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .step-title { font-weight: 600; }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .actions { display: flex; gap: 8px; margin-top: 16px; }
        button { padding: 6px 12px; }
        .icon-btn { background: transparent; border: 1px solid var(--vscode-input-border); color: inherit; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
        .toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
        .secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; }
        .primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; }
    </style>
</head>
<body>
    <h1 id="title"></h1>
    <div class="field">
        <label class="label" for="seqName">Sequence Name</label>
        <input type="text" id="seqName" placeholder="e.g., Start Development Server" />
    </div>

    <div class="toolbar">
        <button id="addStep" class="secondary">+ Add Step</button>
    </div>

    <div id="steps" class="steps"></div>

    <div class="actions">
        <button id="saveBtn" class="primary">Save Changes</button>
        <button id="cancelBtn" class="secondary">Cancel</button>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const initial = ${initialData};
        let steps = initial ? initial.steps.map(s => ({ directory: s.directory, command: s.command })) : [];
        let oldName = initial ? initial.name : undefined;

        const titleEl = document.getElementById('title');
        const nameEl = document.getElementById('seqName');
        const stepsEl = document.getElementById('steps');
        const addStepBtn = document.getElementById('addStep');
        const saveBtn = document.getElementById('saveBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        function render() {
            titleEl.textContent = initial ? ('Edit Sequence: ' + oldName) : 'Add New Sequence';
            if (initial) { nameEl.value = oldName; }
            stepsEl.innerHTML = '';
            steps.forEach((step, index) => {
                const stepDiv = document.createElement('div');
                stepDiv.className = 'step';

                const header = document.createElement('div');
                header.className = 'step-header';
                const title = document.createElement('div');
                title.className = 'step-title';
                title.textContent = 'Step ' + (index + 1);
                const headerActions = document.createElement('div');
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'icon-btn';
                deleteBtn.setAttribute('data-action', 'delete');
                deleteBtn.setAttribute('data-index', String(index));
                deleteBtn.textContent = '🗑 Delete';
                headerActions.appendChild(deleteBtn);
                header.appendChild(title);
                header.appendChild(headerActions);
                stepDiv.appendChild(header);

                const row = document.createElement('div');
                row.className = 'row';
                const fieldDir = document.createElement('div');
                fieldDir.className = 'field';
                const labelDir = document.createElement('label');
                labelDir.className = 'label';
                labelDir.textContent = 'Path (directory)';
                const inputDir = document.createElement('input');
                inputDir.type = 'text';
                inputDir.setAttribute('data-field', 'dir');
                inputDir.setAttribute('data-index', String(index));
                inputDir.placeholder = 'e.g., packages/backend or .';
                inputDir.value = step.directory;
                fieldDir.appendChild(labelDir);
                fieldDir.appendChild(inputDir);

                const fieldCmd = document.createElement('div');
                fieldCmd.className = 'field';
                const labelCmd = document.createElement('label');
                labelCmd.className = 'label';
                labelCmd.textContent = 'Command';
                const inputCmd = document.createElement('input');
                inputCmd.type = 'text';
                inputCmd.setAttribute('data-field', 'cmd');
                inputCmd.setAttribute('data-index', String(index));
                inputCmd.placeholder = 'e.g., npm run build';
                inputCmd.value = step.command;
                fieldCmd.appendChild(labelCmd);
                fieldCmd.appendChild(inputCmd);

                row.appendChild(fieldDir);
                row.appendChild(fieldCmd);
                stepDiv.appendChild(row);
                stepsEl.appendChild(stepDiv);
            });
        }

        function collect() {
            const name = nameEl.value.trim();
            const collected = [];
            steps.forEach((_, idx) => {
                const dirInput = stepsEl.querySelector('input[data-field="dir"][data-index="' + idx + '"]');
                const cmdInput = stepsEl.querySelector('input[data-field="cmd"][data-index="' + idx + '"]');
                const dirVal = dirInput && 'value' in dirInput ? dirInput.value.trim() : '.';
                const cmdVal = cmdInput && 'value' in cmdInput ? cmdInput.value.trim() : '';
                collected.push({ directory: dirVal, command: cmdVal });
            });
            return { name, steps: collected };
        }

        stepsEl.addEventListener('input', (e) => {
            const t = e.target;
            if (t && t.matches('input[data-field]')) {
                const idxAttr = t.getAttribute('data-index');
                const idx = idxAttr ? parseInt(idxAttr) : -1;
                const field = t.getAttribute('data-field');
                if (idx >= 0) {
                    if (field === 'dir') steps[idx].directory = t.value;
                    if (field === 'cmd') steps[idx].command = t.value;
                }
            }
        });

        stepsEl.addEventListener('click', (e) => {
            const t = e.target;
            if (t && t.matches('button.icon-btn[data-action="delete"]')) {
                const idxAttr = t.getAttribute('data-index');
                const idx = idxAttr ? parseInt(idxAttr) : -1;
                if (idx >= 0) {
                    steps.splice(idx, 1);
                    render();
                }
            }
        });

        addStepBtn.addEventListener('click', () => {
            steps.push({ directory: steps.length ? steps[steps.length - 1].directory : '.', command: '' });
            render();
        });

        saveBtn.addEventListener('click', () => {
            const seq = collect();
            if (!seq.name) {
                alert('Please enter a sequence name');
                return;
            }
            if (!seq.steps.length) {
                alert('Please add at least one step');
                return;
            }
            vscode.postMessage({ type: 'save', sequence: seq, oldName });
        });

        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'cancel' });
        });

        render();
    </script>
</body>
</html>`;
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function showSequenceSteps(sequence: CommandSequence): void {
    const steps = sequence.steps.map((step, index) => 
        `Step ${index + 1}:\n  Directory: ${step.directory}\n  Command: ${step.command}`
    ).join('\n\n');

    vscode.window.showInformationMessage(
        `Sequence: ${sequence.name}\n\n${steps}`,
        { modal: true }
    );
}

async function pickSequence(placeHolder: string): Promise<CommandSequence | undefined> {
    const sequences = sequenceProvider.getSequences();
    if (sequences.length === 0) { return undefined; }
    const selected = await vscode.window.showQuickPick(
        sequences.map(s => ({ label: s.name, sequence: s })),
        { placeHolder }
    );
    return selected?.sequence;
}

async function pickStep(sequence: CommandSequence, placeHolder: string): Promise<CommandStep | undefined> {
    if (sequence.steps.length === 0) { return undefined; }
    const selected = await vscode.window.showQuickPick(
        sequence.steps.map((s, i) => ({ label: `${i + 1}. ${s.command}`, description: s.directory, step: s })),
        { placeHolder }
    );
    return selected?.step;
}

export function deactivate() {
    if (executor) {
        executor.dispose();
    }
}
