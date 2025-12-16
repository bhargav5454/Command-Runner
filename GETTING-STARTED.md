# Command Runner - VS Code Extension

## 🎉 Your Extension is Ready!

This extension allows you to store and run custom command sequences step by step with automatic error handling.

## 📋 Features

- **Add Command Sequences**: Store multiple commands with their directories
- **Run with One Click**: Execute all commands in sequence
- **Auto Stop on Error**: Stops execution if any command fails
- **Tree View**: See all your sequences in the sidebar
- **Manage Sequences**: View, run, or delete saved sequences

## 🚀 How to Test Your Extension

1. Press `F5` to open a new VS Code window with your extension loaded
2. In the new window, you'll see a "Command Runner" icon in the Activity Bar (left sidebar)

## 📝 How to Use

### Add a New Sequence:
1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type "Command Runner: Add New Sequence"
3. Enter a name (e.g., "Start Dev Server")
4. For each step, enter:
   - Directory (e.g., `.` for root, `packages/backend` for subdirectory)
   - Command (e.g., `yarn install`)
5. Click "Add another step" or "Finish and save"

### Run a Sequence:
- **Option 1**: Click on a sequence in the sidebar
- **Option 2**: Use Command Palette → "Command Runner: Run Sequence"
- **Option 3**: Right-click a sequence → "Run"

### Example Sequence (Your Use Case):

**Name**: "Start My Project"

**Steps**:
1. Directory: `.` → Command: `yarn install`
2. Directory: `packages/common` → Command: `yarn run build`
3. Directory: `packages/db` → Command: `yarn run build`
4. Directory: `packages/db` → Command: `yarn run migrate:run`
5. Directory: `packages/backend` → Command: `yarn run start:dev`

## 🛠️ Commands Available

- `Command Runner: Add New Sequence` - Create a new command sequence
- `Command Runner: Run Sequence` - Execute a saved sequence
- `Command Runner: Manage Sequences` - View and manage your sequences
- `Command Runner: Delete Sequence` - Remove a sequence

## ⚙️ How It Works

1. All commands run in a terminal called "Command Runner"
2. Each step changes directory and runs the command
3. If any command fails (non-zero exit code), execution stops automatically
4. Progress is shown in notifications and the Output panel

## 📦 Next Steps

### To Package Your Extension:
```bash
npm install -g @vscode/vsce
vsce package
```

This creates a `.vsix` file you can install or share.

### To Install Locally:
1. Package the extension (see above)
2. In VS Code: Extensions → ... → Install from VSIX
3. Select your `.vsix` file

## 🎯 Tips

- Use `.` for the root directory of your workspace
- Use relative paths like `packages/backend` for subdirectories
- Commands are run in PowerShell on Windows, bash/zsh on Mac/Linux
- The terminal stays open so you can see all output
- Check the "Command Runner" output channel for execution logs

## 📂 Project Structure

```
command-runner/
├── src/
│   ├── extension.ts              # Main extension logic
│   ├── commandSequenceProvider.ts # Tree view and storage
│   └── commandExecutor.ts         # Command execution logic
├── package.json                   # Extension manifest
├── tsconfig.json                  # TypeScript config
└── .vscode/
    ├── launch.json                # Debug configuration
    └── tasks.json                 # Build tasks
```

## 🐛 Troubleshooting

**Extension not appearing?**
- Make sure you pressed F5 and a new VS Code window opened
- Check the Debug Console for errors

**Commands not running?**
- Make sure you have a workspace folder open
- Check that directory paths are correct
- View the "Command Runner" output panel for details

**Want to modify?**
- Edit files in `src/`
- Save (auto-compiles with watch mode)
- Reload the extension window (`Ctrl+R`)

Enjoy your extension! 🎊
