import * as vscode from "vscode";

export interface CommandStep {
  directory: string;
  command: string;
  terminal?: string; // e.g., Default, PowerShell, Git Bash, Bash, Cmd, Zsh
  terminalName?: string; // optional custom terminal name to reuse
}

export interface CommandSequence {
  name: string;
  steps: CommandStep[];
  terminal?: string; // defaults for sequence
  terminalName?: string;
}

export class CommandSequenceProvider
  implements vscode.TreeDataProvider<CommandSequenceItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    CommandSequenceItem | undefined | null | void
  > = new vscode.EventEmitter<CommandSequenceItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    CommandSequenceItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CommandSequenceItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CommandSequenceItem): Thenable<CommandSequenceItem[]> {
    if (!element) {
      const sequences = this.getSequences();
      return Promise.resolve(
        sequences.map(
          (seq) =>
            new CommandSequenceItem(
              seq.name,
              seq,
              vscode.TreeItemCollapsibleState.Collapsed,
            ),
        ),
      );
    } else {
      if ("steps" in element.sequence) {
        const seq = element.sequence as CommandSequence;
        return Promise.resolve(
          seq.steps.map(
            (step: CommandStep, index: number) =>
              new CommandSequenceItem(
                `${index + 1}. ${step.command}`,
                step,
                vscode.TreeItemCollapsibleState.None,
                seq.name,
              ),
          ),
        );
      }
      return Promise.resolve([]);
    }
  }

  getSequences(): CommandSequence[] {
    return this.context.globalState.get<CommandSequence[]>(
      "commandSequences",
      [],
    );
  }

  async saveSequence(sequence: CommandSequence): Promise<void> {
    const sequences = this.getSequences();
    const existingIndex = sequences.findIndex((s) => s.name === sequence.name);

    if (existingIndex >= 0) {
      sequences[existingIndex] = sequence;
    } else {
      sequences.push(sequence);
    }

    await this.context.globalState.update("commandSequences", sequences);
    this.refresh();
  }

  async deleteSequence(sequenceName: string): Promise<void> {
    const sequences = this.getSequences();
    const filtered = sequences.filter((s) => s.name !== sequenceName);
    await this.context.globalState.update("commandSequences", filtered);
    this.refresh();
  }

  // Get a sequence by name
  getSequence(name: string): CommandSequence | undefined {
    const sequences = this.getSequences();
    return sequences.find((s) => s.name === name);
  }

  // Check if a sequence with the given name exists
  sequenceExists(name: string): boolean {
    const sequences = this.getSequences();
    return sequences.some((s) => s.name === name);
  }
}

export class CommandSequenceItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly sequence: CommandSequence | CommandStep,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly parentSequenceName?: string,
  ) {
    super(label, collapsibleState);

    if ("steps" in sequence) {
      // This is a sequence
      const seq = sequence as CommandSequence;
      const terminalInfo = seq.terminal
        ? ` [${seq.terminal}]`
        : " [Default Terminal]";
      this.tooltip = `${seq.steps.length} step${seq.steps.length !== 1 ? "s" : ""}${terminalInfo}\n\nClick to run this sequence`;
      this.contextValue = "sequence";
      this.iconPath = new vscode.ThemeIcon("list-ordered");
      this.command = {
        command: "commandRunner.runSequence",
        title: "Run Sequence",
        arguments: [this],
      };
    } else {
      // This is a step
      const step = sequence as CommandStep;
      const terminalInfo = step.terminal
        ? `\nTerminal: ${step.terminal}${step.terminalName ? " (" + step.terminalName + ")" : ""}`
        : "";
      this.tooltip = `📁 ${step.directory}\n⚡ ${step.command}${terminalInfo}\n\nClick to run from this step`;
      this.contextValue = "step";
      this.iconPath = new vscode.ThemeIcon("terminal");
      this.command = {
        command: "commandRunner.runFromStep",
        title: "Run From This Step",
        arguments: [this],
      };
    }
  }
}
