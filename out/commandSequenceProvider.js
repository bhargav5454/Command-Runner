"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandSequenceItem = exports.CommandSequenceProvider = void 0;
const vscode = __importStar(require("vscode"));
class CommandSequenceProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            const sequences = this.getSequences();
            return Promise.resolve(sequences.map((seq) => new CommandSequenceItem(seq.name, seq, vscode.TreeItemCollapsibleState.Collapsed)));
        }
        else {
            if ("steps" in element.sequence) {
                const seq = element.sequence;
                return Promise.resolve(seq.steps.map((step, index) => new CommandSequenceItem(`${index + 1}. ${step.command}`, step, vscode.TreeItemCollapsibleState.None, seq.name)));
            }
            return Promise.resolve([]);
        }
    }
    getSequences() {
        return this.context.globalState.get("commandSequences", []);
    }
    async saveSequence(sequence) {
        const sequences = this.getSequences();
        const existingIndex = sequences.findIndex((s) => s.name === sequence.name);
        if (existingIndex >= 0) {
            sequences[existingIndex] = sequence;
        }
        else {
            sequences.push(sequence);
        }
        await this.context.globalState.update("commandSequences", sequences);
        this.refresh();
    }
    async deleteSequence(sequenceName) {
        const sequences = this.getSequences();
        const filtered = sequences.filter((s) => s.name !== sequenceName);
        await this.context.globalState.update("commandSequences", filtered);
        this.refresh();
    }
    // Get a sequence by name
    getSequence(name) {
        const sequences = this.getSequences();
        return sequences.find((s) => s.name === name);
    }
    // Check if a sequence with the given name exists
    sequenceExists(name) {
        const sequences = this.getSequences();
        return sequences.some((s) => s.name === name);
    }
}
exports.CommandSequenceProvider = CommandSequenceProvider;
class CommandSequenceItem extends vscode.TreeItem {
    constructor(label, sequence, collapsibleState, parentSequenceName) {
        super(label, collapsibleState);
        this.label = label;
        this.sequence = sequence;
        this.collapsibleState = collapsibleState;
        this.parentSequenceName = parentSequenceName;
        if ("steps" in sequence) {
            // This is a sequence
            const seq = sequence;
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
        }
        else {
            // This is a step
            const step = sequence;
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
exports.CommandSequenceItem = CommandSequenceItem;
//# sourceMappingURL=commandSequenceProvider.js.map