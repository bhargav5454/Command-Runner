# Getting Started with Command Runner

## Quick Start Guide

### 1. Create Your First Sequence

1. Click the **Command Runner** icon in the Activity Bar (looks like a terminal)
2. Click the **+** button at the top of the panel
3. Enter a name for your sequence (e.g., "My Build")
4. Click **"+ Add First Step"**

### 2. Add Steps

For each step, you need:
- **Directory**: Where to run the command (`.` means workspace root)
- **Command**: The terminal command to execute

Example:
```
Step 1:
  Directory: .
  Command: npm install

Step 2:
  Directory: ./frontend
  Command: npm run build
```

### 3. Choose Your Terminal

When you run a sequence, you'll be asked to select a terminal:
- **Default**: Uses VS Code's default shell
- **PowerShell**: For Windows PowerShell scripts
- **Git Bash**: For Git Bash on Windows
- **Bash**: For Unix/Linux bash
- **Zsh**: For Zsh shell
- **Command Prompt**: For Windows CMD

### 4. Run Your Sequence

Click the **play icon** next to your sequence in the side bar, or:
1. Open Command Palette (`Ctrl+Shift+P`)
2. Type "Command Runner: Run Sequence"
3. Select your sequence

### 5. Monitor Progress

- Watch the terminal for command output
- Check the Output panel ("Command Runner" channel) for step-by-step progress
- If a command fails, execution stops automatically

## Tips & Tricks

### Use Relative Paths
Directories are relative to your workspace root:
- `.` = workspace root
- `./frontend` = frontend folder in workspace
- `../scripts` = parent directory's scripts folder

### Run From a Specific Step
If your sequence fails at step 3, you don't need to re-run steps 1 and 2:
1. Expand your sequence in the side bar
2. Right-click on step 3
3. Select "Run From This Step"

### Copy Commands
Want to run a single command manually?
1. Right-click on any step
2. Select "Copy Step Command"
3. Paste in any terminal

### Share Sequences
Export your sequences as JSON:
1. Click the export button in the view title
2. Paste the JSON to share with your team
3. They can import it using the import button

## Troubleshooting

### "No workspace folder open"
Command Runner needs an open workspace to resolve relative paths. Open a folder first.

### "Command not found"
Make sure the command is available in your selected terminal. Different shells have different commands.

### "Terminal not responding"
If a terminal gets stuck, you can:
1. Close the terminal manually
2. Run the sequence again - it will create a new terminal

### Git Bash not found
If Git Bash isn't detected:
1. Open VS Code settings
2. Search for "Command Runner"
3. Set "Git Bash Path" to your bash.exe location
