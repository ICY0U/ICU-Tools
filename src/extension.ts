/**
 * @file extension.ts
 * @description Entry point for the Action Buttons VS Code extension.
 *
 * This module exports the {@link activate} and {@link deactivate} lifecycle
 * hooks required by the VS Code extension host. On activation, it
 * initializes the {@link ButtonManager}, registers all commands, and
 * subscribes to configuration change events.
 *
 * Architecture overview:
 * ```
 * extension.ts          — Lifecycle hooks and command registration
 * ├── buttonManager.ts  — Status bar item creation and management
 * ├── commandRunner.ts  — Terminal, VS Code, script, and macro execution
 * ├── buttonCreator.ts  — Interactive UI for adding/editing/removing buttons
 * ├── presets.ts         — Preset button configurations for common workflows
 * ├── variableResolver.ts — Variable substitution (${workspaceFolder}, etc.)
 * └── configTypes.ts    — TypeScript interfaces and constants
 * ```
 */

import * as vscode from 'vscode';

import { ButtonManager } from './buttonManager';
import {
    registerTerminalCloseListener,
    disposeAllTerminals,
} from './commandRunner';
import {
    showAddButtonWizard,
    showEditButtonWizard,
    showRemoveButtonWizard,
    showManageButtonPicker,
    contextEditButton,
    contextChangeCommand,
    contextChangeColor,
    contextChangeIcon,
    contextMoveLeft,
    contextMoveRight,
    contextRemoveButton,
} from './buttonCreator';
import { showPresetPicker } from './presets';
import {
    CONFIG_NAMESPACE,
    ADD_BUTTON_COMMAND,
    REFRESH_COMMAND,
    EDIT_BUTTON_COMMAND,
    REMOVE_BUTTON_COMMAND,
    CONTEXT_EDIT_COMMAND,
    CONTEXT_MOVE_LEFT_COMMAND,
    CONTEXT_MOVE_RIGHT_COMMAND,
    CONTEXT_REMOVE_COMMAND,
    CONTEXT_CHANGE_COLOR_COMMAND,
    CONTEXT_CHANGE_ICON_COMMAND,
    CONTEXT_CHANGE_COMMAND_COMMAND,
} from './configTypes';

// ─── Module State ────────────────────────────────────────────────────────────

/**
 * Singleton reference to the active {@link ButtonManager}.
 * Set during activation, cleared during deactivation.
 */
let buttonManager: ButtonManager | null = null;

// ─── Activation ──────────────────────────────────────────────────────────────

/**
 * Called by VS Code when the extension is activated.
 *
 * Activation occurs on the `onStartupFinished` event, ensuring the
 * extension loads after the editor is fully initialized but before the
 * user begins interacting with the status bar.
 *
 * This function:
 * 1. Creates the {@link ButtonManager} and performs the initial refresh.
 * 2. Registers all extension commands.
 * 3. Subscribes to configuration change events for auto-refresh.
 * 4. Registers the terminal close listener for single-instance cleanup.
 *
 * @param context - The extension context provided by VS Code.
 */
export function activate(context: vscode.ExtensionContext): void {
    console.log('[ActionButtons] Extension activating...');

    // Initialize the button manager
    buttonManager = new ButtonManager(context);
    buttonManager.refresh();

    console.log('[ActionButtons] Button manager initialized and refreshed.');

    // Register the terminal close listener for single-instance tracking
    registerTerminalCloseListener(context);

    // ── Command Registration ─────────────────────────────────────────

    /**
     * "Action Buttons: Refresh" — Reloads all buttons from configuration.
     * Useful after manually editing `settings.json`.
     */
    const refreshCmd = vscode.commands.registerCommand(REFRESH_COMMAND, () => {
        buttonManager?.refresh();
        vscode.window.showInformationMessage('Action Buttons: Refreshed.');
    });

    /**
     * "Action Buttons: Add Button" — Opens the interactive button wizard.
     *
     * If no buttons are configured yet, shows the preset picker first
     * to help users get started quickly. Otherwise, shows a hub menu
     * with options to add new buttons or manage existing ones.
     */
    const addButtonCmd = vscode.commands.registerCommand(ADD_BUTTON_COMMAND, async () => {
        const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
        const existingButtons = config.get<unknown[]>('buttons', []);

        if (existingButtons.length === 0) {
            // First time — offer presets as a starting point
            const choice = await vscode.window.showQuickPick(
                [
                    {
                        label: '$(list-unordered) Start with a Preset',
                        description: 'Choose a pre-configured set of buttons for your project type',
                        action: 'preset' as const,
                    },
                    {
                        label: '$(add) Create a Custom Button',
                        description: 'Build a button from scratch step by step',
                        action: 'custom' as const,
                    },
                ],
                {
                    title: 'Action Buttons: Get Started',
                    placeHolder: 'No buttons configured yet — how would you like to start?',
                },
            );

            if (!choice) {
                return;
            }

            if (choice.action === 'preset') {
                await showPresetPicker();
            } else {
                await showAddButtonWizard();
            }
        } else {
            // Buttons exist — show hub menu with add + manage options
            const hubChoice = await vscode.window.showQuickPick(
                [
                    {
                        label: '$(add) Add New Button',
                        description: 'Create a new action button step by step',
                        action: 'add' as const,
                    },
                    {
                        label: '$(gear) Manage Buttons',
                        description: 'Edit, move, recolor, or remove existing buttons',
                        action: 'manage' as const,
                    },
                    {
                        label: '$(list-unordered) Load Preset',
                        description: 'Add a pre-configured set of buttons',
                        action: 'preset' as const,
                    },
                ],
                {
                    title: 'Action Buttons',
                    placeHolder: `${existingButtons.length} button(s) configured`,
                },
            );

            if (!hubChoice) {
                return;
            }

            switch (hubChoice.action) {
                case 'add':
                    await showAddButtonWizard();
                    break;
                case 'manage':
                    await showManageButtonPicker();
                    break;
                case 'preset':
                    await showPresetPicker();
                    break;
            }
        }
    });

    /**
     * "Action Buttons: Edit Button" — Opens the edit wizard for an existing button.
     */
    const editButtonCmd = vscode.commands.registerCommand(EDIT_BUTTON_COMMAND, async () => {
        await showEditButtonWizard();
    });

    /**
     * "Action Buttons: Remove Button" — Opens the removal wizard.
     */
    const removeButtonCmd = vscode.commands.registerCommand(REMOVE_BUTTON_COMMAND, async () => {
        await showRemoveButtonWizard();
    });

    // Push all command disposables into the extension context
    context.subscriptions.push(refreshCmd, addButtonCmd, editButtonCmd, removeButtonCmd);

    // ── Context Menu Command Registration ────────────────────────────

    /**
     * Right-click context menu commands for individual status bar buttons.
     * VS Code passes `{ id: statusBarItemId }` as the argument, which
     * we use to identify which button was right-clicked.
     */
    const contextEditCmd = vscode.commands.registerCommand(
        CONTEXT_EDIT_COMMAND,
        (args: { id: string }) => contextEditButton(args),
    );

    const contextChangeCommandCmd = vscode.commands.registerCommand(
        CONTEXT_CHANGE_COMMAND_COMMAND,
        (args: { id: string }) => contextChangeCommand(args),
    );

    const contextChangeColorCmd = vscode.commands.registerCommand(
        CONTEXT_CHANGE_COLOR_COMMAND,
        (args: { id: string }) => contextChangeColor(args),
    );

    const contextChangeIconCmd = vscode.commands.registerCommand(
        CONTEXT_CHANGE_ICON_COMMAND,
        (args: { id: string }) => contextChangeIcon(args),
    );

    const contextMoveLeftCmd = vscode.commands.registerCommand(
        CONTEXT_MOVE_LEFT_COMMAND,
        (args: { id: string }) => contextMoveLeft(args),
    );

    const contextMoveRightCmd = vscode.commands.registerCommand(
        CONTEXT_MOVE_RIGHT_COMMAND,
        (args: { id: string }) => contextMoveRight(args),
    );

    const contextRemoveCmd = vscode.commands.registerCommand(
        CONTEXT_REMOVE_COMMAND,
        (args: { id: string }) => contextRemoveButton(args),
    );

    context.subscriptions.push(
        contextEditCmd,
        contextChangeCommandCmd,
        contextChangeColorCmd,
        contextChangeIconCmd,
        contextMoveLeftCmd,
        contextMoveRightCmd,
        contextRemoveCmd,
    );

    // ── Configuration Change Listener ────────────────────────────────

    /**
     * Watches for changes to the `actionButtons` configuration namespace.
     * Automatically refreshes all buttons when settings are modified.
     */
    const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(CONFIG_NAMESPACE)) {
            buttonManager?.refresh();
        }
    });

    context.subscriptions.push(configListener);

    // ── Built-in Smart Toggle Commands ───────────────────────────────

    /**
     * Smart terminal panel toggle that works around the VS Code focus issue.
     *
     * The built-in `workbench.action.terminal.toggleTerminal` checks focus
     * state — if the terminal is visible but not focused, it **focuses** it
     * instead of hiding it. Since clicking a status bar button steals focus
     * from the terminal before the command fires, the built-in toggle can
     * never close the panel from a status bar click.
     *
     * This command uses explicit open/close commands with state tracking
     * and a terminal event listener to stay in sync.
     */
    let terminalPanelOpen = false;

    // Stay in sync when a terminal gains focus (panel is open)
    const terminalFocusListener = vscode.window.onDidChangeActiveTerminal((terminal) => {
        if (terminal) {
            terminalPanelOpen = true;
        }
    });

    const toggleTerminalCmd = vscode.commands.registerCommand(
        'actionButtons.toggleTerminalPanel',
        async () => {
            if (terminalPanelOpen) {
                await vscode.commands.executeCommand('workbench.action.closePanel');
                terminalPanelOpen = false;
            } else {
                await vscode.commands.executeCommand('workbench.action.terminal.focus');
                terminalPanelOpen = true;
            }
        },
    );

    context.subscriptions.push(terminalFocusListener, toggleTerminalCmd);

    // ── Cleanup Registration ─────────────────────────────────────────

    // Register the button manager itself for disposal on deactivation
    context.subscriptions.push(buttonManager);
}

// ─── Deactivation ────────────────────────────────────────────────────────────

/**
 * Called by VS Code when the extension is deactivated.
 *
 * Disposes the button manager and all tracked terminals.
 */
export function deactivate(): void {
    disposeAllTerminals();
    buttonManager?.dispose();
    buttonManager = null;
}
