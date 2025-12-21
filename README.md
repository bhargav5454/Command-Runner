# Command Runner for VS Code

Command Runner is a powerful VS Code extension that allows you to create, manage, and execute sequences of terminal commands. It's perfect for automating complex workflows, setup scripts, or multi-step build processes directly from your editor.

## Features

- **Create Command Sequences**: Group multiple terminal commands into a single named sequence.
- **Visual Editor**: Use a modern, drag-and-drop interface to add, edit, and reorder steps.
- **Step-by-Step Execution**: Commands run sequentially in the integrated terminal.
- **Directory Support**: Specify a working directory for each step (relative to workspace root or absolute).
- **Failure Handling**: Execution stops automatically if a command fails (non-zero exit code).
- **Run From Step**: Resume or debug a sequence by starting from a specific step.
- **Manage Sequences**: View, edit, delete, or run sequences easily from the side bar or command palette.

## Usage

### 1. Creating a Sequence
1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Type **"Command Runner: Add New Sequence"**.
3. In the editor that appears:
   - Enter a name for your sequence (e.g., "Full Build").
   - Click **"+ Add Step"** to add commands.
   - For each step, specify:
     - **Directory**: The folder where the command should run (use `.` for root).
     - **Command**: The actual terminal command (e.g., `npm install`).
   - Drag steps to reorder them if needed.
   - Click **"Save Sequence"**.

### 2. Running a Sequence
- **From Side Bar**: Open the "Command Runner" view in the Activity Bar (terminal icon), find your sequence, and click the "Play" icon.
- **From Command Palette**: Run **"Command Runner: Run Sequence"** and select the sequence from the list.

### 3. Editing a Sequence
- **From Side Bar**: Right-click a sequence and select **"Edit Sequence"**.
- **From Command Palette**: Run **"Command Runner: Edit Sequence"**.

### 4. Running From a Specific Step
- In the "Command Runner" side bar view, expand a sequence to see its steps.
- Right-click on any step and select **"Run From This Step"**. This is useful if a long sequence failed halfway through and you fixed the issue.

## Extension Commands

- `commandRunner.addSequence`: Open the editor to create a new sequence.
- `commandRunner.runSequence`: Execute an existing sequence.
- `commandRunner.editSequence`: Open the editor to modify an existing sequence.
- `commandRunner.deleteSequence`: Remove a sequence.
- `commandRunner.manageSequences`: Quick pick menu to manage sequences.
- `commandRunner.runFromStep`: Start execution from a specific step.
- `commandRunner.copyStepCommand`: Copy the combined `cd ... && command` string to clipboard.

## Requirements

- VS Code 1.85.0 or newer.

## Extension Settings

This extension stores your sequences in the global state of VS Code, so they persist across sessions but are specific to your machine.

## Known Issues

- On Windows, commands are executed in PowerShell. Ensure your commands are PowerShell-compatible or use standard cross-platform commands.

## Release Notes

### 1.0.0
- Initial release of Command Runner.
- Support for creating, editing, and running command sequences.
- Webview-based editor with drag-and-drop support.
