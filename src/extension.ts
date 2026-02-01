import * as vscode from "vscode";
import {
  CommandSequenceProvider,
  CommandSequence,
  CommandStep,
  CommandSequenceItem,
} from "./commandSequenceProvider";
import { CommandExecutor } from "./commandExecutor";
import { SequenceEditorManager } from "./sequenceEditorManager";

let sequenceProvider: CommandSequenceProvider;
let executor: CommandExecutor;

export function activate(context: vscode.ExtensionContext) {
  console.log("Command Runner extension is now active");

  // Initialize provider and executor
  sequenceProvider = new CommandSequenceProvider(context);
  executor = new CommandExecutor();

  // Register tree view
  const treeView = vscode.window.createTreeView("commandSequences", {
    treeDataProvider: sequenceProvider,
    showCollapseAll: true,
  });

  // Register commands
  const addSequenceCommand = vscode.commands.registerCommand(
    "commandRunner.addSequence",
    () => {
      SequenceEditorManager.createOrShow(
        context.extensionUri,
        sequenceProvider,
      );
    },
  );

  const runSequenceCommand = vscode.commands.registerCommand(
    "commandRunner.runSequence",
    async (item?: CommandSequenceItem) => {
      if (item && "steps" in item.sequence) {
        await executor.runSequence(item.sequence as CommandSequence);
      } else {
        // Show quick pick if no item selected
        const sequences = sequenceProvider.getSequences();
        if (sequences.length === 0) {
          vscode.window.showInformationMessage(
            "No command sequences found. Add one first!",
          );
          return;
        }

        const selected = await vscode.window.showQuickPick(
          sequences.map((s) => ({
            label: s.name,
            description: `${s.steps.length} step${s.steps.length !== 1 ? "s" : ""}`,
            sequence: s,
          })),
          { placeHolder: "Select a sequence to run" },
        );

        if (selected) {
          await executor.runSequence(selected.sequence);
        }
      }
    },
  );

  const deleteSequenceCommand = vscode.commands.registerCommand(
    "commandRunner.deleteSequence",
    async (item?: CommandSequenceItem) => {
      let sequenceName: string | undefined;

      if (item && "steps" in item.sequence) {
        sequenceName = (item.sequence as CommandSequence).name;
      } else {
        const sequences = sequenceProvider.getSequences();
        if (sequences.length === 0) {
          vscode.window.showInformationMessage("No sequences to delete.");
          return;
        }
        const selected = await vscode.window.showQuickPick(
          sequences.map((s) => s.name),
          { placeHolder: "Select a sequence to delete" },
        );
        sequenceName = selected;
      }

      if (sequenceName) {
        const confirm = await vscode.window.showWarningMessage(
          `Delete sequence "${sequenceName}"?`,
          { modal: true },
          "Delete",
          "Cancel",
        );

        if (confirm === "Delete") {
          await sequenceProvider.deleteSequence(sequenceName);
          vscode.window.showInformationMessage(
            `Deleted sequence: ${sequenceName}`,
          );
        }
      }
    },
  );

  const manageSequencesCommand = vscode.commands.registerCommand(
    "commandRunner.manageSequences",
    async () => {
      const sequences = sequenceProvider.getSequences();

      if (sequences.length === 0) {
        vscode.window.showInformationMessage(
          "No command sequences found. Add one first!",
        );
        return;
      }

      const options = sequences.map((s) => ({
        label: s.name,
        description: `${s.steps.length} step${s.steps.length !== 1 ? "s" : ""}`,
        detail: s.terminal
          ? `Terminal: ${s.terminal}`
          : "Terminal: Default",
        sequence: s,
      }));

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: "Select a sequence to view or edit",
      });

      if (selected) {
        const action = await vscode.window.showQuickPick(
          [
            { label: "▶️ Run", action: "run" },
            { label: "✏️ Edit", action: "edit" },
            { label: "🗑️ Delete", action: "delete" },
            { label: "👁️ View Steps", action: "view" },
          ],
          { placeHolder: `What do you want to do with "${selected.label}"?` },
        );

        if (action) {
          switch (action.action) {
            case "run":
              await executor.runSequence(selected.sequence);
              break;
            case "edit":
              SequenceEditorManager.createOrShow(
                context.extensionUri,
                sequenceProvider,
                selected.sequence,
              );
              break;
            case "delete":
              await vscode.commands.executeCommand(
                "commandRunner.deleteSequence",
              );
              break;
            case "view":
              showSequenceSteps(selected.sequence);
              break;
          }
        }
      }
    },
  );

  // Edit Sequence command
  const editSequenceCommand = vscode.commands.registerCommand(
    "commandRunner.editSequence",
    async (item?: CommandSequenceItem) => {
      let sequence: CommandSequence | undefined;
      if (item && "steps" in item.sequence) {
        sequence = item.sequence as CommandSequence;
      } else {
        const chosen = await pickSequence("Select a sequence to edit");
        sequence = chosen ?? undefined;
      }
      if (sequence) {
        SequenceEditorManager.createOrShow(
          context.extensionUri,
          sequenceProvider,
          sequence,
        );
      }
    },
  );

  // Run From This Step command
  const runFromStepCommand = vscode.commands.registerCommand(
    "commandRunner.runFromStep",
    async (item?: CommandSequenceItem) => {
      if (!item || "steps" in item.sequence) {
        vscode.window.showWarningMessage("Please choose a step to run from.");
        return;
      }
      const step = item.sequence as CommandStep;
      const parentSeqName = item.parentSequenceName;
      if (!parentSeqName) {
        vscode.window.showErrorMessage(
          "Could not determine parent sequence for this step.",
        );
        return;
      }
      const seq = sequenceProvider
        .getSequences()
        .find((s) => s.name === parentSeqName);
      if (!seq) {
        vscode.window.showErrorMessage(
          `Parent sequence "${parentSeqName}" not found.`,
        );
        return;
      }
      const startIndex = seq.steps.findIndex(
        (s) =>
          s === step ||
          (s.command === step.command && s.directory === step.directory),
      );
      if (startIndex < 0) {
        vscode.window.showErrorMessage("Step not found in sequence.");
        return;
      }

      const confirm = await vscode.window.showInformationMessage(
        `Run "${seq.name}" starting from step ${startIndex + 1}?`,
        "Run",
        "Cancel",
      );

      if (confirm === "Run") {
        const subSeq: CommandSequence = {
          name: `${seq.name} (from step ${startIndex + 1})`,
          steps: seq.steps.slice(startIndex),
          terminal: seq.terminal,
          terminalName: seq.terminalName,
        };
        await executor.runSequence(subSeq);
      }
    },
  );

  // Copy Step Command
  const copyStepCommand = vscode.commands.registerCommand(
    "commandRunner.copyStepCommand",
    async (item?: CommandSequenceItem) => {
      if (!item || "steps" in item.sequence) {
        vscode.window.showWarningMessage("Please choose a step to copy.");
        return;
      }
      const step = item.sequence as CommandStep;
      const commandText = `cd "${step.directory}" && ${step.command}`;
      await vscode.env.clipboard.writeText(commandText);
      vscode.window.showInformationMessage("Step command copied to clipboard");
    },
  );

  // Run All Sequences command
  const runAllSequencesCommand = vscode.commands.registerCommand(
    "commandRunner.runAllSequences",
    async () => {
      const sequences = sequenceProvider.getSequences();
      if (sequences.length === 0) {
        vscode.window.showInformationMessage("No sequences to run.");
        return;
      }

      const confirm = await vscode.window.showInformationMessage(
        `Run all ${sequences.length} sequence${sequences.length !== 1 ? "s" : ""}?`,
        "Run All",
        "Cancel",
      );

      if (confirm === "Run All") {
        let successCount = 0;
        let failCount = 0;

        for (const sequence of sequences) {
          const success = await executor.runSequence(sequence);
          if (success) {
            successCount++;
          } else {
            failCount++;
            // Ask if user wants to continue
            if (failCount > 0) {
              const continueRun = await vscode.window.showWarningMessage(
                `Sequence "${sequence.name}" failed. Continue with remaining sequences?`,
                "Continue",
                "Stop",
              );
              if (continueRun !== "Continue") {
                break;
              }
            }
          }
        }

        vscode.window.showInformationMessage(
          `Completed: ${successCount} succeeded, ${failCount} failed`,
        );
      }
    },
  );

  // Duplicate Sequence command
  const duplicateSequenceCommand = vscode.commands.registerCommand(
    "commandRunner.duplicateSequence",
    async (item?: CommandSequenceItem) => {
      let sequence: CommandSequence | undefined;
      if (item && "steps" in item.sequence) {
        sequence = item.sequence as CommandSequence;
      } else {
        sequence = await pickSequence("Select a sequence to duplicate");
      }

      if (!sequence) {
        return;
      }

      // Generate unique name
      let newName = `${sequence.name} (Copy)`;
      let counter = 1;
      while (sequenceProvider.sequenceExists(newName)) {
        counter++;
        newName = `${sequence.name} (Copy ${counter})`;
      }

      const duplicatedSequence: CommandSequence = {
        name: newName,
        steps: [...sequence.steps.map((s) => ({ ...s }))],
        terminal: sequence.terminal,
        terminalName: sequence.terminalName,
      };

      await sequenceProvider.saveSequence(duplicatedSequence);
      vscode.window.showInformationMessage(
        `Duplicated sequence as "${newName}"`,
      );
    },
  );

  // Export Sequences command
  const exportSequencesCommand = vscode.commands.registerCommand(
    "commandRunner.exportSequences",
    async () => {
      const sequences = sequenceProvider.getSequences();
      if (sequences.length === 0) {
        vscode.window.showInformationMessage("No sequences to export.");
        return;
      }

      const jsonContent = JSON.stringify(sequences, null, 2);
      await vscode.env.clipboard.writeText(jsonContent);
      vscode.window.showInformationMessage(
        `${sequences.length} sequence${sequences.length !== 1 ? "s" : ""} exported to clipboard as JSON`,
      );
    },
  );

  // Import Sequences command
  const importSequencesCommand = vscode.commands.registerCommand(
    "commandRunner.importSequences",
    async () => {
      const jsonInput = await vscode.window.showInputBox({
        prompt: "Paste JSON sequences to import",
        placeHolder: '[{"name": "...", "steps": [...]}]',
        validateInput: (value) => {
          try {
            JSON.parse(value);
            return null;
          } catch {
            return "Invalid JSON";
          }
        },
      });

      if (!jsonInput) {
        return;
      }

      try {
        const imported = JSON.parse(jsonInput) as CommandSequence[];
        if (!Array.isArray(imported)) {
          throw new Error("Imported data is not an array");
        }

        let importedCount = 0;
        for (const seq of imported) {
          if (seq.name && Array.isArray(seq.steps)) {
            // Generate unique name if exists
            let name = seq.name;
            let counter = 1;
            while (sequenceProvider.sequenceExists(name)) {
              name = `${seq.name} (Imported ${counter})`;
              counter++;
            }
            seq.name = name;
            await sequenceProvider.saveSequence(seq);
            importedCount++;
          }
        }

        vscode.window.showInformationMessage(
          `Imported ${importedCount} sequence${importedCount !== 1 ? "s" : ""}`,
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Import failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
  );

  // Refresh View command
  const refreshViewCommand = vscode.commands.registerCommand(
    "commandRunner.refreshView",
    () => {
      sequenceProvider.refresh();
      vscode.window.showInformationMessage("Command Runner view refreshed");
    },
  );

  // Show Output command
  const showOutputCommand = vscode.commands.registerCommand(
    "commandRunner.showOutput",
    () => {
      // This is handled by the executor, but we register it here for the command palette
    },
  );

  context.subscriptions.push(
    addSequenceCommand,
    runSequenceCommand,
    deleteSequenceCommand,
    manageSequencesCommand,
    editSequenceCommand,
    runFromStepCommand,
    copyStepCommand,
    runAllSequencesCommand,
    duplicateSequenceCommand,
    exportSequencesCommand,
    importSequencesCommand,
    refreshViewCommand,
    showOutputCommand,
    treeView,
    executor,
  );
}

function showSequenceSteps(sequence: CommandSequence): void {
  const steps = sequence.steps
    .map(
      (step, index) =>
        `Step ${index + 1}:\n  📁 Directory: ${step.directory}\n  ⚡ Command: ${step.command}${step.terminal ? `\n  🖥️ Terminal: ${step.terminal}` : ""}`,
    )
    .join("\n\n");

  vscode.window.showInformationMessage(
    `Sequence: ${sequence.name}\n\n${steps}`,
    { modal: true },
  );
}

async function pickSequence(
  placeHolder: string,
): Promise<CommandSequence | undefined> {
  const sequences = sequenceProvider.getSequences();
  if (sequences.length === 0) {
    vscode.window.showInformationMessage("No sequences available.");
    return undefined;
  }
  const selected = await vscode.window.showQuickPick(
    sequences.map((s) => ({
      label: s.name,
      description: `${s.steps.length} step${s.steps.length !== 1 ? "s" : ""}`,
      sequence: s,
    })),
    { placeHolder },
  );
  return selected?.sequence;
}

export function deactivate() {
  if (executor) {
    executor.dispose();
  }
}
