# Command Runner for VS Code

A powerful VS Code extension that allows you to create, manage, and execute sequences of terminal commands. Perfect for automating complex workflows, setup scripts, or multi-step build processes directly from your editor.

## Features

- **Create Command Sequences**: Group multiple terminal commands into a single named sequence
- **Step-by-Step Execution**: Commands run sequentially with proper error handling
- **Error Handling**: Execution stops automatically if a command fails (non-zero exit code)
- **Multiple Terminal Support**: Choose different terminals (PowerShell, Git Bash, Bash, Zsh, CMD) for each sequence or even each step
- **Run From Step**: Resume or debug a sequence by starting from a specific step
- **Duplicate Sequences**: Quickly copy existing sequences
- **Import/Export**: Share sequences with your team via JSON export/import
- **Visual Editor**: Modern webview-based editor with drag-and-drop step reordering
- **Directory Support**: Specify a working directory for each step (relative to workspace root or absolute)

## Installation

1. Download the `.vsix` file from the releases
2. Open VS Code
3. Go to Extensions view (Ctrl+Shift+X)
4. Click "..." menu → "Install from VSIX"
5. Select the downloaded file

Or install directly from VS Code marketplace (when published):
```
ext install command-runner
```

## Usage

### Creating a Sequence

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type **"Command Runner: Add New Sequence"**
3. In the editor:
   - Enter a name for your sequence (e.g., "Full Build")
   - Select a default terminal (optional)
   - Click **"+ Add Step"** to add commands
   - For each step, specify:
     - **Directory**: The folder where the command should run (use `.` for root)
     - **Command**: The actual terminal command (e.g., `npm install`)
     - **Terminal** (optional): Override the default terminal for this step
   - Drag steps to reorder them
   - Click **"Save Sequence"**

### Running a Sequence

- **From Side Bar**: Open the "Command Runner" view in the Activity Bar, find your sequence, and click the play icon
- **From Command Palette**: Run **"Command Runner: Run Sequence"**
- **Run All**: Execute all sequences with **"Command Runner: Run All Sequences"**

### Running From a Specific Step

1. Expand a sequence in the side bar to see its steps
2. Right-click on any step and select **"Run From This Step"**
3. Useful when a long sequence failed halfway through and you fixed the issue

### Terminal Selection

When running a sequence, you can choose:
- **Default Terminal**: Uses VS Code's default shell
- **PowerShell**: Windows PowerShell or PowerShell Core
- **Git Bash**: Git Bash (commonly on Windows)
- **Bash**: Unix Bash shell
- **Zsh**: Zsh shell
- **Command Prompt**: Windows CMD

Each step can also have its own terminal setting if needed!

## Example Workflows

### Frontend Build & Deploy
```
Step 1: .          → npm install
Step 2: .          → npm run build
Step 3: ./dist     → npm run deploy
```

### Multi-Project Setup
```
Step 1: ./backend  → npm install
Step 2: ./backend  → npm run dev
Step 3: ./frontend → npm install  
Step 4: ./frontend → npm start
```

### Database Migration
```
Step 1: .          → npm run db:migrate
Step 2: .          → npm run db:seed
Step 3: .          → npm run test:db
```

## Extension Commands

| Command | Description |
|---------|-------------|
| `commandRunner.addSequence` | Create a new command sequence |
| `commandRunner.runSequence` | Execute a sequence |
| `commandRunner.runAllSequences` | Run all sequences |
| `commandRunner.editSequence` | Modify an existing sequence |
| `commandRunner.deleteSequence` | Remove a sequence |
| `commandRunner.duplicateSequence` | Copy a sequence |
| `commandRunner.runFromStep` | Start execution from a specific step |
| `commandRunner.copyStepCommand` | Copy the command to clipboard |
| `commandRunner.exportSequences` | Export all sequences as JSON |
| `commandRunner.importSequences` | Import sequences from JSON |
| `commandRunner.refreshView` | Refresh the side bar view |

## Extension Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `commandRunner.preferredShell` | Default shell for new terminals | `"Default"` |
| `commandRunner.gitBashPath` | Path to Git Bash executable | `"C:\\Program Files\\Git\\bin\\bash.exe"` |
| `commandRunner.stopOnError` | Stop execution on command failure | `true` |
| `commandRunner.showNotifications` | Show progress notifications | `true` |

## Requirements

- VS Code 1.85.0 or newer
- For Git Bash support on Windows: Git for Windows installed

## Known Issues

- On Windows, commands are executed in the selected shell. Ensure your commands are compatible with the chosen shell.
- Terminal output monitoring is limited by VS Code's API - error detection relies on exit codes.

## Release Notes

### 2.0.0
- Added multiple terminal support (PowerShell, Git Bash, Bash, Zsh, CMD)
- Added per-step terminal selection
- Added Run All Sequences command
- Added Duplicate Sequence feature
- Added Import/Export functionality
- Improved error handling with proper exit code detection
- Enhanced UI with better styling and icons
- Added step reordering with buttons (up/down arrows)

### 1.0.0
- Initial release
- Basic command sequence creation and execution
- Tree view for managing sequences
- Webview-based editor

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details
