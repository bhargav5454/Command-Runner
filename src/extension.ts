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
        await addNewSequence();
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
                    await editSequence(selected.sequence);
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

    context.subscriptions.push(
        addSequenceCommand,
        runSequenceCommand,
        deleteSequenceCommand,
        manageSequencesCommand,
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

async function editSequence(sequence: CommandSequence): Promise<void> {
    vscode.window.showInformationMessage('Editing existing sequences will be available in the next update. For now, you can delete and recreate the sequence.');
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

export function deactivate() {
    if (executor) {
        executor.dispose();
    }
}
