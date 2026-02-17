/**
 * @file commandRunner.ts
 * @description Unified command execution engine for the Action Buttons extension.
 *
 * Handles four distinct execution modes:
 * - **Terminal commands** — Shell commands run in VS Code's integrated terminal.
 * - **VS Code commands** — Editor commands invoked via `vscode.commands.executeCommand`.
 * - **Script files** — Script files executed with the appropriate interpreter.
 * - **Macros** — Ordered sequences of the above three types.
 *
 * Terminal lifecycle is managed per-button with optional single-instance
 * semantics (disposing the previous terminal before creating a new one).
 */

import * as vscode from 'vscode';
import * as path from 'path';

import {
    ButtonConfig,
    MacroStep,
    SCRIPT_INTERPRETERS,
} from './configTypes';
import { resolveVariables } from './variableResolver';

// ─── Terminal Registry ───────────────────────────────────────────────────────

/**
 * Maps button identifiers to their active terminal instances.
 * Used to implement single-instance mode — only one terminal per button.
 */
const terminalRegistry = new Map<string, vscode.Terminal>();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Executes the action defined by a {@link ButtonConfig}, dispatching to the
 * appropriate runner based on `commandType`.
 *
 * @param config      - The button configuration to execute.
 * @param buttonId    - A unique identifier for this button (used for terminal tracking).
 * @returns A promise that resolves when the command has been dispatched.
 *          For terminal commands, this resolves after the command is sent
 *          (not after it completes).
 * @throws {Error} If `commandType` is `"macro"` but `commands` is empty or missing.
 */
export async function executeButtonAction(
    config: ButtonConfig,
    buttonId: string,
): Promise<void> {
    const commandType = config.commandType ?? 'terminal';

    switch (commandType) {
        case 'terminal':
            await runTerminalCommand(config, buttonId);
            break;

        case 'vscode':
            await runVSCodeCommand(config);
            break;

        case 'script':
            await runScriptFile(config, buttonId);
            break;

        case 'macro':
            await runMacro(config, buttonId);
            break;

        default:
            vscode.window.showErrorMessage(
                `Action Buttons: Unknown command type "${commandType}" for button "${config.name}".`,
            );
    }
}

/**
 * Registers a terminal close listener to clean up the registry when
 * terminals are disposed externally (e.g., user closes the terminal tab).
 *
 * @param context - The extension context to register the listener with.
 */
export function registerTerminalCloseListener(context: vscode.ExtensionContext): void {
    const listener = vscode.window.onDidCloseTerminal((closedTerminal) => {
        for (const [id, terminal] of terminalRegistry) {
            if (terminal === closedTerminal) {
                terminalRegistry.delete(id);
                break;
            }
        }
    });

    context.subscriptions.push(listener);
}

/**
 * Disposes all tracked terminals. Called during extension deactivation.
 */
export function disposeAllTerminals(): void {
    for (const terminal of terminalRegistry.values()) {
        terminal.dispose();
    }
    terminalRegistry.clear();
}

// ─── Terminal Command Runner ─────────────────────────────────────────────────

/**
 * Executes a shell command in the integrated terminal.
 *
 * If `singleInstance` is enabled (default), any existing terminal for this
 * button is disposed before creating a new one. The command string and
 * working directory undergo variable substitution before execution.
 *
 * @param config   - Button configuration with the command and terminal settings.
 * @param buttonId - Unique identifier for terminal tracking.
 */
async function runTerminalCommand(config: ButtonConfig, buttonId: string): Promise<void> {
    const command = resolveVariables(config.command ?? '');
    if (!command) {
        vscode.window.showWarningMessage(
            `Action Buttons: No command specified for button "${config.name}".`,
        );
        return;
    }

    // Single-instance: dispose the previous terminal if it exists
    const singleInstance = config.singleInstance ?? true;
    if (singleInstance) {
        await disposeTerminalById(buttonId);
    }

    // Resolve the working directory
    const cwd = config.cwd ? resolveVariables(config.cwd) : undefined;

    // Create a new terminal with the button's settings
    const terminal = vscode.window.createTerminal({
        name: `Action: ${config.name}`,
        cwd,
        env: config.env as Record<string, string> | undefined,
        iconPath: config.icon ? new vscode.ThemeIcon(config.icon) : undefined,
    });

    // Track the terminal for single-instance management
    terminalRegistry.set(buttonId, terminal);

    // Send the command and optionally focus the terminal
    terminal.sendText(command);

    const shouldFocus = config.focus ?? true;
    if (shouldFocus) {
        terminal.show(false); // `false` = take focus
    } else {
        terminal.show(true);  // `true` = preserve focus (don't steal)
    }
}

// ─── VS Code Command Runner ─────────────────────────────────────────────────

/**
 * Invokes a VS Code editor command by its command ID.
 *
 * @param config - Button configuration containing the VS Code command ID
 *                 in the `command` field.
 */
async function runVSCodeCommand(config: ButtonConfig): Promise<void> {
    const commandId = config.command?.trim();
    if (!commandId) {
        vscode.window.showWarningMessage(
            `Action Buttons: No VS Code command specified for button "${config.name}".`,
        );
        return;
    }

    try {
        await vscode.commands.executeCommand(commandId);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
            `Action Buttons: Failed to execute command "${commandId}": ${message}`,
        );
    }
}

// ─── Script File Runner ──────────────────────────────────────────────────────

/**
 * Executes a script file using the appropriate interpreter based on the
 * file extension. The script path undergoes variable substitution.
 *
 * Interpreter mapping:
 * | Extension     | Interpreter     |
 * |---------------|-----------------|
 * | `.py`         | `python`        |
 * | `.ps1`        | `powershell`    |
 * | `.sh`, `.bash`| `bash`          |
 * | `.bat`, `.cmd`| (direct)        |
 *
 * @param config   - Button configuration with the script file path in `command`.
 * @param buttonId - Unique identifier for terminal tracking.
 */
async function runScriptFile(config: ButtonConfig, buttonId: string): Promise<void> {
    const rawPath = resolveVariables(config.command ?? '');
    if (!rawPath) {
        vscode.window.showWarningMessage(
            `Action Buttons: No script path specified for button "${config.name}".`,
        );
        return;
    }

    // Determine the file extension and corresponding interpreter
    const extension = path.extname(rawPath).toLowerCase();
    const interpreter = SCRIPT_INTERPRETERS[extension];

    let fullCommand: string;
    if (interpreter === undefined) {
        // Unknown extension — attempt to run directly
        fullCommand = quotePathIfNeeded(rawPath);
    } else if (interpreter === '') {
        // .bat / .cmd — run directly (Windows handles these natively)
        fullCommand = quotePathIfNeeded(rawPath);
    } else {
        // Prefix with the interpreter
        fullCommand = `${interpreter} ${quotePathIfNeeded(rawPath)}`;
    }

    // Delegate to the terminal runner with the constructed command
    const scriptConfig: ButtonConfig = {
        ...config,
        command: fullCommand,
        commandType: 'terminal',
    };

    await runTerminalCommand(scriptConfig, buttonId);
}

// ─── Macro Runner ────────────────────────────────────────────────────────────

/**
 * Executes a multi-step macro — an ordered sequence of {@link MacroStep}
 * entries. Each step is dispatched to the appropriate runner, and an
 * optional delay can be inserted between steps.
 *
 * @param config   - Button configuration with macro steps in `commands`.
 * @param buttonId - Unique identifier for terminal tracking.
 * @throws {Error} If `commands` is empty or undefined.
 */
async function runMacro(config: ButtonConfig, buttonId: string): Promise<void> {
    const steps = config.commands;
    if (!steps || steps.length === 0) {
        vscode.window.showWarningMessage(
            `Action Buttons: No macro steps defined for button "${config.name}".`,
        );
        return;
    }

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepButtonId = `${buttonId}:step-${i}`;

        await executeMacroStep(step, stepButtonId, config);

        // Wait for the optional delay before the next step
        if (step.delay && step.delay > 0 && i < steps.length - 1) {
            await delay(step.delay);
        }
    }
}

/**
 * Executes a single macro step by dispatching to the correct runner.
 *
 * @param step         - The macro step definition.
 * @param stepButtonId - Unique ID for this step (used for terminal tracking).
 * @param parentConfig - The parent button config (for inheriting cwd, env, etc.).
 */
async function executeMacroStep(
    step: MacroStep,
    stepButtonId: string,
    parentConfig: ButtonConfig,
): Promise<void> {
    switch (step.type) {
        case 'terminal': {
            const stepConfig: ButtonConfig = {
                ...parentConfig,
                command: step.command,
                commandType: 'terminal',
                singleInstance: false, // Don't kill previous steps
            };
            await runTerminalCommand(stepConfig, stepButtonId);
            break;
        }

        case 'vscode': {
            const stepConfig: ButtonConfig = {
                ...parentConfig,
                command: step.command,
                commandType: 'vscode',
            };
            await runVSCodeCommand(stepConfig);
            break;
        }

        case 'script': {
            const stepConfig: ButtonConfig = {
                ...parentConfig,
                command: step.command,
                commandType: 'script',
            };
            await runScriptFile(stepConfig, stepButtonId);
            break;
        }

        default:
            vscode.window.showErrorMessage(
                `Action Buttons: Unknown macro step type "${step.type}" in button "${parentConfig.name}".`,
            );
    }
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Disposes the terminal associated with the given button ID and removes
 * it from the registry. Waits for the terminal to fully close before
 * resolving.
 *
 * @param buttonId - The button identifier whose terminal should be disposed.
 */
async function disposeTerminalById(buttonId: string): Promise<void> {
    const existing = terminalRegistry.get(buttonId);
    if (!existing) {
        return;
    }

    // Wait for the terminal to fully close before proceeding
    await new Promise<void>((resolve) => {
        const listener = vscode.window.onDidCloseTerminal((closedTerminal) => {
            if (closedTerminal === existing) {
                listener.dispose();
                resolve();
            }
        });

        existing.dispose();
        terminalRegistry.delete(buttonId);

        // Safety timeout — resolve after 2 seconds regardless
        setTimeout(() => {
            listener.dispose();
            resolve();
        }, 2000);
    });
}

/**
 * Wraps a file path in double quotes if it contains spaces.
 *
 * @param filePath - The file path to potentially quote.
 * @returns The quoted path, or the original if no spaces are present.
 */
function quotePathIfNeeded(filePath: string): string {
    if (filePath.includes(' ') && !filePath.startsWith('"')) {
        return `"${filePath}"`;
    }
    return filePath;
}

/**
 * Returns a promise that resolves after the specified number of milliseconds.
 *
 * @param ms - Delay duration in milliseconds.
 */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
