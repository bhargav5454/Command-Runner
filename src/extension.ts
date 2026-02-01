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
  vscode.window.registerTreeDataProvider("commandSequences", sequenceProvider);

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
    async (item: CommandSequenceItem) => {
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
          sequences.map((s) => ({ label: s.name, sequence: s })),
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
    async (item: CommandSequenceItem) => {
      let sequenceName: string | undefined;

      if (item && "steps" in item.sequence) {
        sequenceName = (item.sequence as CommandSequence).name;
      } else {
        const sequences = sequenceProvider.getSequences();
        const selected = await vscode.window.showQuickPick(
          sequences.map((s) => s.name),
          { placeHolder: "Select a sequence to delete" },
        );
        sequenceName = selected;
      }

      if (sequenceName) {
        const confirm = await vscode.window.showWarningMessage(
          `Delete sequence "${sequenceName}"?`,
          "Yes",
          "No",
        );

        if (confirm === "Yes") {
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
        description: `${s.steps.length} steps`,
        sequence: s,
      }));

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: "Select a sequence to view or edit",
      });

      if (selected) {
        const action = await vscode.window.showQuickPick(
          ["Run", "Edit", "Delete", "View Steps"],
          { placeHolder: `What do you want to do with "${selected.label}"?` },
        );

        switch (action) {
          case "Run":
            await executor.runSequence(selected.sequence);
            break;
          case "Edit":
            SequenceEditorManager.createOrShow(
              context.extensionUri,
              sequenceProvider,
              selected.sequence,
            );
            break;
          case "Delete":
            await vscode.commands.executeCommand(
              "commandRunner.deleteSequence",
            );
            break;
          case "View Steps":
            showSequenceSteps(selected.sequence);
            break;
        }
      }
    },
  );

  // New: Edit Sequence command
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

  // New: Run From This Step
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
      const subSeq: CommandSequence = {
        name: `${seq.name} (from step ${startIndex + 1})`,
        steps: seq.steps.slice(startIndex),
        terminal: seq.terminal,
        terminalName: seq.terminalName,
      };
      await executor.runSequence(subSeq);
    },
  );

  // New: Copy Step Command
  const copyStepCommand = vscode.commands.registerCommand(
    "commandRunner.copyStepCommand",
    async (item?: CommandSequenceItem) => {
      if (!item || "steps" in item.sequence) {
        vscode.window.showWarningMessage("Please choose a step to copy.");
        return;
      }
      const step = item.sequence as CommandStep;
      await vscode.env.clipboard.writeText(
        `cd ${step.directory} && ${step.command}`,
      );
      vscode.window.showInformationMessage("Step command copied to clipboard");
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
    executor,
  );
}

function showSequenceSteps(sequence: CommandSequence): void {
  const steps = sequence.steps
    .map(
      (step, index) =>
        `Step ${index + 1}:\n  Directory: ${step.directory}\n  Command: ${step.command}`,
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
    return undefined;
  }
  const selected = await vscode.window.showQuickPick(
    sequences.map((s) => ({ label: s.name, sequence: s })),
    { placeHolder },
  );
  return selected?.sequence;
}

// Kept for compatibility if needed, though unused in current commands
async function pickStep(
  sequence: CommandSequence,
  placeHolder: string,
): Promise<CommandStep | undefined> {
  if (sequence.steps.length === 0) {
    return undefined;
  }
  const selected = await vscode.window.showQuickPick(
    sequence.steps.map((s, i) => ({
      label: `${i + 1}. ${s.command}`,
      description: s.directory,
      step: s,
    })),
    { placeHolder },
  );
  return selected?.step;
}

export function deactivate() {
  if (executor) {
    executor.dispose();
  }
}
