/**
 * @file buttonCreator.ts
 * @description Interactive UI flow for creating, editing, and removing action buttons.
 *
 * Provides a multi-step Quick Pick wizard that guides the user through
 * configuring a new button — selecting the command type, entering the
 * command, choosing an icon and color, and saving to workspace settings.
 *
 * Also supports editing existing buttons (pre-filled values) and removing
 * buttons via a selection list.
 */

import * as vscode from 'vscode';

import {
    ButtonConfig,
    CommandType,
    MacroStep,
    SemanticColor,
    CONFIG_NAMESPACE,
    COMMAND_PREFIX,
    SCRIPT_FILE_FILTERS,
} from './configTypes';

// ─── Icon Catalog ────────────────────────────────────────────────────────────

/**
 * Curated list of commonly used codicon icons for action buttons.
 * Each entry maps a codicon name to a human-readable description.
 */
const ICON_CATALOG: ReadonlyArray<{ label: string; description: string; iconId: string }> = [
    { label: '$(play) play',                 description: 'Run / Start server',       iconId: 'play' },
    { label: '$(debug-start) debug-start',   description: 'Debug',                    iconId: 'debug-start' },
    { label: '$(terminal) terminal',         description: 'Terminal command',          iconId: 'terminal' },
    { label: '$(package) package',           description: 'Bundle / Package',          iconId: 'package' },
    { label: '$(tools) tools',               description: 'Build / Compile',           iconId: 'tools' },
    { label: '$(run-all) run-all',           description: 'Build & Run',               iconId: 'run-all' },
    { label: '$(beaker) beaker',             description: 'Test',                      iconId: 'beaker' },
    { label: '$(cloud-upload) cloud-upload', description: 'Deploy',                    iconId: 'cloud-upload' },
    { label: '$(trash) trash',               description: 'Clean',                     iconId: 'trash' },
    { label: '$(refresh) refresh',           description: 'Restart / Reload',          iconId: 'refresh' },
    { label: '$(rocket) rocket',             description: 'Launch',                    iconId: 'rocket' },
    { label: '$(database) database',         description: 'Database',                  iconId: 'database' },
    { label: '$(server) server',             description: 'Server',                    iconId: 'server' },
    { label: '$(eye) eye',                   description: 'Watch mode',                iconId: 'eye' },
    { label: '$(checklist) checklist',       description: 'Lint / Validate',           iconId: 'checklist' },
    { label: '$(bug) bug',                   description: 'Debug',                     iconId: 'bug' },
    { label: '$(flame) flame',               description: 'Hot reload',                iconId: 'flame' },
    { label: '$(zap) zap',                   description: 'Fast action',               iconId: 'zap' },
    { label: '$(gear) gear',                 description: 'Settings / Config',          iconId: 'gear' },
    { label: '$(file-code) file-code',       description: 'Script / Code file',        iconId: 'file-code' },
];

/**
 * Color options presented in the Quick Pick for button color selection.
 * Maps semantic names to their foreground hex values.
 */
const COLOR_OPTIONS: ReadonlyArray<{ label: string; description: string; colorName: SemanticColor; hex: string }> = [
    { label: '🟢 Green',  description: '#4EC9B0', colorName: 'green',  hex: '#4EC9B0' },
    { label: '🟡 Yellow', description: '#DCDCAA', colorName: 'yellow', hex: '#DCDCAA' },
    { label: '🟠 Orange', description: '#CE9178', colorName: 'orange', hex: '#CE9178' },
    { label: '🔴 Red',    description: '#F44747', colorName: 'red',    hex: '#F44747' },
    { label: '🔵 Blue',   description: '#569CD6', colorName: 'blue',   hex: '#569CD6' },
    { label: '🟣 Purple', description: '#C586C0', colorName: 'purple', hex: '#C586C0' },
    { label: '🩵 Teal',   description: '#4DC9B0', colorName: 'teal',   hex: '#4DC9B0' },
    { label: '⬜ White',  description: '#FFFFFF — default', colorName: 'green', hex: '#FFFFFF' },
];

// ─── Command Type Options ────────────────────────────────────────────────────

/**
 * Quick Pick items for selecting the command type of a new button.
 */
const COMMAND_TYPE_OPTIONS: ReadonlyArray<{ label: string; description: string; commandType: CommandType }> = [
    {
        label: '$(terminal) Terminal Command',
        description: 'Run a shell command in the integrated terminal',
        commandType: 'terminal',
    },
    {
        label: '$(code) VS Code Command',
        description: 'Execute a VS Code editor command (e.g., format, reload)',
        commandType: 'vscode',
    },
    {
        label: '$(file-code) Run Script File',
        description: 'Browse for a .bat, .ps1, .sh, or .py file to run',
        commandType: 'script',
    },
    {
        label: '$(list-ordered) Multi-Step Macro',
        description: 'Define a sequence of commands to run in order',
        commandType: 'macro',
    },
];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Launches the interactive "Add Button" wizard.
 *
 * Guides the user through a multi-step flow:
 * 1. Select command type (terminal / VS Code / script / macro)
 * 2. Enter or browse for the command
 * 3. Name the button
 * 4. Choose an icon
 * 5. Choose a color
 * 6. Optionally toggle advanced settings
 * 7. Save to workspace settings or open settings.json
 *
 * @returns A promise that resolves when the wizard completes or is cancelled.
 */
export async function showAddButtonWizard(): Promise<void> {
    // Step 1: Select command type
    const commandTypeSelection = await vscode.window.showQuickPick(COMMAND_TYPE_OPTIONS, {
        title: 'Action Buttons: Add Button (Step 1/5)',
        placeHolder: 'What type of action should this button perform?',
    });

    if (!commandTypeSelection) {
        return; // User cancelled
    }

    const commandType = commandTypeSelection.commandType;

    // Step 2: Get the command(s)
    let command: string | undefined;
    let macroSteps: MacroStep[] | undefined;

    switch (commandType) {
        case 'terminal':
            command = await promptForTerminalCommand();
            break;
        case 'vscode':
            command = await promptForVSCodeCommand();
            break;
        case 'script':
            command = await promptForScriptFile();
            break;
        case 'macro':
            macroSteps = await promptForMacroSteps();
            break;
    }

    // Validate that something was provided
    if (commandType === 'macro' && (!macroSteps || macroSteps.length === 0)) {
        return; // User cancelled or provided no steps
    }
    if (commandType !== 'macro' && !command) {
        return; // User cancelled
    }

    // Step 3: Name the button
    const suggestedName = generateSuggestedName(commandType, command, macroSteps);
    const name = await vscode.window.showInputBox({
        title: 'Action Buttons: Add Button (Step 3/5)',
        prompt: 'Enter a name for this button',
        value: suggestedName,
        validateInput: (value) => value.trim() ? null : 'Button name cannot be empty',
    });

    if (!name) {
        return; // User cancelled
    }

    // Step 4: Choose an icon
    const iconSelection = await vscode.window.showQuickPick(ICON_CATALOG, {
        title: 'Action Buttons: Add Button (Step 4/5)',
        placeHolder: 'Choose an icon for the button',
    });

    // Icon is optional — user can skip by pressing Escape
    const icon = iconSelection?.iconId;

    // Step 5: Choose a color
    const colorSelection = await vscode.window.showQuickPick(COLOR_OPTIONS, {
        title: 'Action Buttons: Add Button (Step 5/5)',
        placeHolder: 'Choose a color for the button',
    });

    const backgroundColor = colorSelection?.colorName;

    // Build the button configuration
    const newButton: ButtonConfig = buildButtonConfig({
        name: name.trim(),
        command,
        commandType,
        macroSteps,
        icon,
        backgroundColor,
    });

    // Save or open settings
    await promptToSaveButton(newButton);
}

/**
 * Launches the "Edit Button" wizard for an existing button.
 *
 * Presents a list of all configured buttons, then allows the user to
 * modify the selected button's properties.
 *
 * @returns A promise that resolves when editing completes or is cancelled.
 */
export async function showEditButtonWizard(): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const buttons = config.get<ButtonConfig[]>('buttons', []);

    if (buttons.length === 0) {
        vscode.window.showInformationMessage(
            'Action Buttons: No buttons configured yet. Use the "+" button to add one.',
        );
        return;
    }

    // Present a list of existing buttons
    const items = buttons.map((button, index) => ({
        label: `${button.icon ? `$(${button.icon}) ` : ''}${button.name}`,
        description: button.command ?? (button.commandType === 'macro' ? `${button.commands?.length ?? 0} macro steps` : ''),
        detail: `Type: ${button.commandType ?? 'terminal'}`,
        index,
    }));

    const selection = await vscode.window.showQuickPick(items, {
        title: 'Action Buttons: Edit Button',
        placeHolder: 'Select a button to edit',
    });

    if (!selection) {
        return; // User cancelled
    }

    // Offer a submenu of editable properties
    const editActions = [
        { label: '$(edit) Rename',           action: 'rename' as const },
        { label: '$(terminal) Change Command', action: 'command' as const },
        { label: '$(symbol-color) Change Color', action: 'color' as const },
        { label: '$(symbol-misc) Change Icon',   action: 'icon' as const },
        { label: '$(json) Open in settings.json', action: 'openSettings' as const },
    ];

    const editSelection = await vscode.window.showQuickPick(editActions, {
        title: `Editing: ${buttons[selection.index].name}`,
        placeHolder: 'What would you like to change?',
    });

    if (!editSelection) {
        return;
    }

    const updatedButtons = [...buttons];
    const targetButton = { ...updatedButtons[selection.index] };

    switch (editSelection.action) {
        case 'rename': {
            const newName = await vscode.window.showInputBox({
                prompt: 'Enter the new button name',
                value: targetButton.name,
                validateInput: (v) => v.trim() ? null : 'Name cannot be empty',
            });
            if (newName) {
                targetButton.name = newName.trim();
            }
            break;
        }

        case 'command': {
            const newCommand = await vscode.window.showInputBox({
                prompt: 'Enter the new command',
                value: targetButton.command ?? '',
            });
            if (newCommand !== undefined) {
                (targetButton as { command: string }).command = newCommand;
            }
            break;
        }

        case 'color': {
            const colorPick = await vscode.window.showQuickPick(COLOR_OPTIONS, {
                placeHolder: 'Choose a new color',
            });
            if (colorPick) {
                (targetButton as { backgroundColor: SemanticColor }).backgroundColor = colorPick.colorName;
            }
            break;
        }

        case 'icon': {
            const iconPick = await vscode.window.showQuickPick(ICON_CATALOG, {
                placeHolder: 'Choose a new icon',
            });
            if (iconPick) {
                (targetButton as { icon: string }).icon = iconPick.iconId;
            }
            break;
        }

        case 'openSettings': {
            await openSettingsFile();
            return;
        }
    }

    updatedButtons[selection.index] = targetButton;
    await config.update('buttons', updatedButtons, vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage(`Action Buttons: Updated "${targetButton.name}".`);
}

/**
 * Launches the "Remove Button" wizard.
 *
 * Presents a list of all configured buttons and removes the selected one
 * from workspace settings.
 *
 * @returns A promise that resolves when removal completes or is cancelled.
 */
export async function showRemoveButtonWizard(): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const buttons = config.get<ButtonConfig[]>('buttons', []);

    if (buttons.length === 0) {
        vscode.window.showInformationMessage('Action Buttons: No buttons to remove.');
        return;
    }

    const items = buttons.map((button, index) => ({
        label: `${button.icon ? `$(${button.icon}) ` : ''}${button.name}`,
        description: button.command ?? `${button.commands?.length ?? 0} macro steps`,
        index,
    }));

    const selection = await vscode.window.showQuickPick(items, {
        title: 'Action Buttons: Remove Button',
        placeHolder: 'Select a button to remove',
    });

    if (!selection) {
        return;
    }

    // Confirm removal
    const confirmation = await vscode.window.showWarningMessage(
        `Remove button "${buttons[selection.index].name}"?`,
        { modal: true },
        'Remove',
    );

    if (confirmation !== 'Remove') {
        return;
    }

    const updatedButtons = buttons.filter((_, i) => i !== selection.index);
    await config.update('buttons', updatedButtons, vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage(
        `Action Buttons: Removed "${buttons[selection.index].name}".`,
    );
}

// ─── Manage Buttons Picker ──────────────────────────────────────────────────

/**
 * Shows a management Quick Pick for an existing button, offering
 * Edit, Move Left, Move Right, Change Color/Icon/Command, and Remove.
 *
 * This replaces the non-functional `statusBar/item/context` right-click
 * menu by providing an equivalent interactive UI via Quick Pick.
 *
 * @param buttonIndex - The zero-based index of the button to manage.
 * @param buttons     - The current array of button configurations.
 */
async function showButtonManagementActions(buttonIndex: number, buttons: ButtonConfig[]): Promise<void> {
    const button = buttons[buttonIndex];

    const actions: Array<{ label: string; description?: string; action: string }> = [
        { label: '$(edit) Edit Button',         description: 'Rename, change command, color, or icon',  action: 'edit' },
        { label: '$(arrow-left) Move Left',     description: 'Move button one position to the left',    action: 'moveLeft' },
        { label: '$(arrow-right) Move Right',   description: 'Move button one position to the right',   action: 'moveRight' },
        { label: '$(symbol-color) Change Color', description: 'Pick a new color for this button',       action: 'changeColor' },
        { label: '$(symbol-misc) Change Icon',  description: 'Pick a new icon for this button',         action: 'changeIcon' },
        { label: '$(terminal) Change Command',  description: 'Change the command this button runs',     action: 'changeCommand' },
        { label: '$(trash) Remove Button',      description: 'Delete this button permanently',          action: 'remove' },
    ];

    // Disable move actions at boundaries
    if (buttonIndex <= 0) {
        actions[1] = { ...actions[1], description: '(already at leftmost position)' };
    }
    if (buttonIndex >= buttons.length - 1) {
        actions[2] = { ...actions[2], description: '(already at rightmost position)' };
    }

    const selection = await vscode.window.showQuickPick(actions, {
        title: `Manage: ${button.name}`,
        placeHolder: 'Choose an action',
    });

    if (!selection) {
        return;
    }

    // Synthesize an args object matching the context menu signature
    const fakeArgs = { id: `${COMMAND_PREFIX}.${buttonIndex}` };

    switch (selection.action) {
        case 'edit':
            await contextEditButton(fakeArgs);
            break;
        case 'moveLeft':
            await contextMoveLeft(fakeArgs);
            break;
        case 'moveRight':
            await contextMoveRight(fakeArgs);
            break;
        case 'changeColor':
            await contextChangeColor(fakeArgs);
            break;
        case 'changeIcon':
            await contextChangeIcon(fakeArgs);
            break;
        case 'changeCommand':
            await contextChangeCommand(fakeArgs);
            break;
        case 'remove':
            await contextRemoveButton(fakeArgs);
            break;
    }
}

/**
 * Shows a Quick Pick list of all configured buttons for management.
 *
 * The user selects a button, then sees a submenu with management actions
 * (edit, move, change color/icon, remove). This serves as the primary
 * management interface since VS Code does not support custom context menus
 * on status bar items.
 *
 * @returns A promise that resolves when management completes or is cancelled.
 */
export async function showManageButtonPicker(): Promise<void> {
    const buttons = readButtons();

    if (buttons.length === 0) {
        vscode.window.showInformationMessage(
            'Action Buttons: No buttons configured yet. Use the "+" button to add one.',
        );
        return;
    }

    const items = buttons.map((button, index) => ({
        label: `${button.icon ? `$(${button.icon}) ` : ''}${button.name}`,
        description: button.backgroundColor ?? '',
        detail: `${button.commandType ?? 'terminal'}: ${button.command ?? (button.commands ? `${button.commands.length} steps` : '')}`,
        index,
    }));

    const selection = await vscode.window.showQuickPick(items, {
        title: 'Action Buttons: Manage Buttons',
        placeHolder: 'Select a button to edit, move, or remove',
    });

    if (!selection) {
        return;
    }

    await showButtonManagementActions(selection.index, buttons);
}

// ─── Command Input Prompts ───────────────────────────────────────────────────

/**
 * Prompts the user to type a terminal (shell) command.
 *
 * @returns The entered command string, or `undefined` if cancelled.
 */
async function promptForTerminalCommand(): Promise<string | undefined> {
    return vscode.window.showInputBox({
        title: 'Action Buttons: Add Button (Step 2/5)',
        prompt: 'Enter the terminal command to run',
        placeHolder: 'e.g., npm run build, cargo test, python main.py',
    });
}

/**
 * Prompts the user to select a VS Code command from the full command palette.
 *
 * Fetches all available commands and presents them in a searchable Quick Pick.
 *
 * @returns The selected command ID, or `undefined` if cancelled.
 */
async function promptForVSCodeCommand(): Promise<string | undefined> {
    // Fetch all available VS Code commands (excluding internal ones)
    const allCommands = await vscode.commands.getCommands(/* filterInternal */ true);
    const sortedCommands = allCommands.sort();

    const items = sortedCommands.map((cmd) => ({
        label: cmd,
        description: '',
    }));

    const selection = await vscode.window.showQuickPick(items, {
        title: 'Action Buttons: Add Button (Step 2/5)',
        placeHolder: 'Search for a VS Code command...',
        matchOnDescription: true,
    });

    return selection?.label;
}

/**
 * Opens a file picker dialog for the user to select a script file.
 *
 * Filters to common script extensions (`.bat`, `.ps1`, `.sh`, `.py`, etc.).
 *
 * @returns The selected file path (relative to workspace if possible),
 *          or `undefined` if cancelled.
 */
async function promptForScriptFile(): Promise<string | undefined> {
    const fileUris = await vscode.window.showOpenDialog({
        title: 'Action Buttons: Select Script File (Step 2/5)',
        canSelectMany: false,
        canSelectFolders: false,
        filters: SCRIPT_FILE_FILTERS as Record<string, string[]>,
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
    });

    if (!fileUris || fileUris.length === 0) {
        return undefined;
    }

    const selectedUri = fileUris[0];

    // Convert to workspace-relative path if possible
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(selectedUri);
    if (workspaceFolder) {
        const relativePath = vscode.workspace.asRelativePath(selectedUri, false);
        return '${workspaceFolder}/' + relativePath.replace(/\\/g, '/');
    }

    return selectedUri.fsPath;
}

/**
 * Guides the user through building a multi-step macro — an ordered list
 * of commands to execute sequentially.
 *
 * Each step prompts for a type (terminal/vscode/script) and a command,
 * then asks whether to add another step.
 *
 * @returns An array of {@link MacroStep} entries, or `undefined` if cancelled.
 */
async function promptForMacroSteps(): Promise<MacroStep[] | undefined> {
    const steps: MacroStep[] = [];
    let addingSteps = true;

    while (addingSteps) {
        const stepNumber = steps.length + 1;

        // Pick the step type
        const stepTypeOptions = [
            { label: '$(terminal) Terminal Command',    type: 'terminal' as const },
            { label: '$(code) VS Code Command',         type: 'vscode' as const },
            { label: '$(file-code) Run Script File',    type: 'script' as const },
        ];

        const stepType = await vscode.window.showQuickPick(stepTypeOptions, {
            title: `Macro Step ${stepNumber}: Choose Type`,
            placeHolder: `Step ${stepNumber} — what type of action?`,
        });

        if (!stepType) {
            // If this is the first step and user cancels, abort entirely
            if (steps.length === 0) {
                return undefined;
            }
            break; // Otherwise, finish with what we have
        }

        // Get the command for this step
        let stepCommand: string | undefined;

        switch (stepType.type) {
            case 'terminal':
                stepCommand = await vscode.window.showInputBox({
                    title: `Macro Step ${stepNumber}: Terminal Command`,
                    prompt: 'Enter the terminal command for this step',
                    placeHolder: 'e.g., npm run build',
                });
                break;

            case 'vscode':
                stepCommand = await promptForVSCodeCommand();
                break;

            case 'script':
                stepCommand = await promptForScriptFile();
                break;
        }

        if (!stepCommand) {
            if (steps.length === 0) {
                return undefined;
            }
            break;
        }

        // Prompt for optional delay
        const delayInput = await vscode.window.showInputBox({
            title: `Macro Step ${stepNumber}: Delay`,
            prompt: 'Optional delay (ms) after this step before the next one (leave empty for none)',
            placeHolder: '0',
            validateInput: (value) => {
                if (value && isNaN(Number(value))) {
                    return 'Please enter a valid number';
                }
                return null;
            },
        });

        const delayMs = delayInput ? parseInt(delayInput, 10) : undefined;

        steps.push({
            type: stepType.type,
            command: stepCommand,
            delay: delayMs && delayMs > 0 ? delayMs : undefined,
        });

        // Ask if the user wants to add another step
        const addMore = await vscode.window.showQuickPick(
            [
                { label: '$(add) Add Another Step',     continueAdding: true },
                { label: '$(check) Done — Save Macro',  continueAdding: false },
            ],
            {
                title: `Macro: ${steps.length} step(s) defined`,
                placeHolder: 'Add another step or finish?',
            },
        );

        addingSteps = addMore?.continueAdding ?? false;
    }

    return steps.length > 0 ? steps : undefined;
}

// ─── Configuration Helpers ───────────────────────────────────────────────────

/**
 * Builds a clean {@link ButtonConfig} object from the wizard inputs.
 *
 * Only includes non-default properties to keep the settings file concise.
 *
 * @param params - The collected wizard inputs.
 * @returns A minimal {@link ButtonConfig} with only relevant properties set.
 */
function buildButtonConfig(params: {
    name: string;
    command: string | undefined;
    commandType: CommandType;
    macroSteps: MacroStep[] | undefined;
    icon: string | undefined;
    backgroundColor: SemanticColor | undefined;
}): ButtonConfig {
    // Start with the required `name` field
    const config: Partial<ButtonConfig> & { name: string } = {
        name: params.name,
    };

    // Only include commandType if non-default
    if (params.commandType !== 'terminal') {
        (config as Record<string, unknown>).commandType = params.commandType;
    }

    // Include command or commands based on type
    if (params.commandType === 'macro' && params.macroSteps) {
        (config as Record<string, unknown>).commands = params.macroSteps;
    } else if (params.command) {
        (config as Record<string, unknown>).command = params.command;
    }

    // Optional properties — only include when specified
    if (params.icon) {
        (config as Record<string, unknown>).icon = params.icon;
    }
    if (params.backgroundColor) {
        (config as Record<string, unknown>).backgroundColor = params.backgroundColor;
    }

    return config as ButtonConfig;
}

/**
 * Prompts the user to save the new button to workspace settings or
 * open `settings.json` for manual editing.
 *
 * @param newButton - The button configuration to save.
 */
async function promptToSaveButton(newButton: ButtonConfig): Promise<void> {
    const saveOptions = [
        { label: '$(save) Save to Workspace Settings', action: 'save' as const },
        { label: '$(json) Open settings.json (Advanced)', action: 'open' as const },
    ];

    const saveChoice = await vscode.window.showQuickPick(saveOptions, {
        title: 'Action Buttons: Save Button',
        placeHolder: 'How would you like to save this button?',
    });

    if (!saveChoice) {
        return;
    }

    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const existingButtons = config.get<ButtonConfig[]>('buttons', []);
    const updatedButtons = [...existingButtons, newButton];

    await config.update('buttons', updatedButtons, vscode.ConfigurationTarget.Workspace);

    if (saveChoice.action === 'open') {
        await openSettingsFile();
    }

    vscode.window.showInformationMessage(
        `Action Buttons: Added "${newButton.name}" button.`,
    );
}

/**
 * Opens the workspace `settings.json` file in the editor.
 */
async function openSettingsFile(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.openWorkspaceSettingsFile');
}

/**
 * Generates a suggested button name based on the command type and command string.
 *
 * @param commandType - The type of command.
 * @param command     - The command string (if applicable).
 * @param macroSteps  - Macro steps (if applicable).
 * @returns A reasonable default name for the button.
 */
function generateSuggestedName(
    commandType: CommandType,
    command: string | undefined,
    macroSteps: MacroStep[] | undefined,
): string {
    switch (commandType) {
        case 'terminal': {
            if (!command) {
                return 'Run';
            }
            // Extract the main command name (first word or npm script name)
            const parts = command.trim().split(/\s+/);
            if (parts[0] === 'npm' && parts[1] === 'run' && parts[2]) {
                return capitalizeFirst(parts[2]);
            }
            if (parts[0] === 'npx' && parts[1]) {
                return capitalizeFirst(parts[1]);
            }
            return capitalizeFirst(parts[0]);
        }

        case 'vscode': {
            if (!command) {
                return 'Command';
            }
            // Extract readable name from command ID (e.g., "editor.action.formatDocument" → "Format Document")
            const lastPart = command.split('.').pop() ?? command;
            return lastPart
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, (c) => c.toUpperCase())
                .trim();
        }

        case 'script': {
            if (!command) {
                return 'Run Script';
            }
            // Extract filename from path
            const fileName = command.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'Script';
            return capitalizeFirst(fileName);
        }

        case 'macro': {
            if (!macroSteps || macroSteps.length === 0) {
                return 'Macro';
            }
            return `Macro (${macroSteps.length} steps)`;
        }

        default:
            return 'Action';
    }
}

/**
 * Capitalizes the first character of a string.
 *
 * @param str - The input string.
 * @returns The string with its first character uppercased.
 */
function capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Context Menu Actions ────────────────────────────────────────────────────
//
// These functions are invoked from the right-click context menu on status bar
// buttons. VS Code passes the status bar item ID as an argument, which we use
// to determine which button was right-clicked.

/**
 * Extracts the button index from a status bar item ID.
 *
 * Status bar item IDs follow the pattern `actionButtons.run.{index}`.
 *
 * @param statusBarItemId - The ID of the status bar item (passed by VS Code).
 * @returns The button index, or `-1` if the ID format is unrecognized.
 */
function extractButtonIndex(statusBarItemId: string): number {
    const prefix = `${COMMAND_PREFIX}.`;
    if (!statusBarItemId.startsWith(prefix)) {
        return -1;
    }
    const index = parseInt(statusBarItemId.slice(prefix.length), 10);
    return isNaN(index) ? -1 : index;
}

/**
 * Reads the current button array from workspace settings.
 *
 * @returns The current array of button configurations.
 */
function readButtons(): ButtonConfig[] {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    return config.get<ButtonConfig[]>('buttons', []);
}

/**
 * Writes an updated button array to workspace settings.
 *
 * @param buttons - The updated array of button configurations.
 */
async function writeButtons(buttons: ButtonConfig[]): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    await config.update('buttons', buttons, vscode.ConfigurationTarget.Workspace);
}

/**
 * Context menu action: **Edit Button**.
 *
 * Opens a Quick Pick submenu allowing the user to rename, change
 * command, color, or icon of the right-clicked button.
 *
 * @param args - Arguments passed by VS Code. `args.id` is the status bar item ID.
 */
export async function contextEditButton(args: { id: string }): Promise<void> {
    const index = extractButtonIndex(args.id);
    const buttons = readButtons();

    if (index < 0 || index >= buttons.length) {
        return;
    }

    const button = buttons[index];
    const editActions = [
        { label: '$(edit) Rename',              action: 'rename' as const },
        { label: '$(terminal) Change Command',  action: 'command' as const },
        { label: '$(symbol-color) Change Color', action: 'color' as const },
        { label: '$(symbol-misc) Change Icon',  action: 'icon' as const },
        { label: '$(json) Open in settings.json', action: 'openSettings' as const },
    ];

    const selection = await vscode.window.showQuickPick(editActions, {
        title: `Edit: ${button.name}`,
        placeHolder: 'What would you like to change?',
    });

    if (!selection) {
        return;
    }

    const updatedButtons = [...buttons];
    const target = { ...updatedButtons[index] };

    switch (selection.action) {
        case 'rename': {
            const newName = await vscode.window.showInputBox({
                prompt: 'Enter the new button name',
                value: target.name,
                validateInput: (v) => v.trim() ? null : 'Name cannot be empty',
            });
            if (newName) {
                (target as { name: string }).name = newName.trim();
            } else {
                return;
            }
            break;
        }

        case 'command': {
            const newCommand = await vscode.window.showInputBox({
                prompt: 'Enter the new command',
                value: target.command ?? '',
            });
            if (newCommand !== undefined) {
                (target as { command: string }).command = newCommand;
            } else {
                return;
            }
            break;
        }

        case 'color': {
            const colorPick = await vscode.window.showQuickPick(COLOR_OPTIONS, {
                placeHolder: 'Choose a new color',
            });
            if (colorPick) {
                (target as { backgroundColor: SemanticColor }).backgroundColor = colorPick.colorName;
            } else {
                return;
            }
            break;
        }

        case 'icon': {
            const iconPick = await vscode.window.showQuickPick(ICON_CATALOG, {
                placeHolder: 'Choose a new icon',
            });
            if (iconPick) {
                (target as { icon: string }).icon = iconPick.iconId;
            } else {
                return;
            }
            break;
        }

        case 'openSettings': {
            await vscode.commands.executeCommand('workbench.action.openWorkspaceSettingsFile');
            return;
        }
    }

    updatedButtons[index] = target;
    await writeButtons(updatedButtons);
    vscode.window.showInformationMessage(`Action Buttons: Updated "${target.name}".`);
}

/**
 * Context menu action: **Change Command**.
 *
 * Prompts the user to type a new command for the right-clicked button.
 *
 * @param args - Arguments passed by VS Code. `args.id` is the status bar item ID.
 */
export async function contextChangeCommand(args: { id: string }): Promise<void> {
    const index = extractButtonIndex(args.id);
    const buttons = readButtons();

    if (index < 0 || index >= buttons.length) {
        return;
    }

    const button = buttons[index];
    const newCommand = await vscode.window.showInputBox({
        title: `Change Command: ${button.name}`,
        prompt: 'Enter the new command',
        value: button.command ?? '',
    });

    if (newCommand === undefined) {
        return;
    }

    const updatedButtons = [...buttons];
    updatedButtons[index] = { ...button, command: newCommand } as ButtonConfig;
    await writeButtons(updatedButtons);
    vscode.window.showInformationMessage(`Action Buttons: Updated command for "${button.name}".`);
}

/**
 * Context menu action: **Change Color**.
 *
 * Shows a color picker for the right-clicked button.
 *
 * @param args - Arguments passed by VS Code. `args.id` is the status bar item ID.
 */
export async function contextChangeColor(args: { id: string }): Promise<void> {
    const index = extractButtonIndex(args.id);
    const buttons = readButtons();

    if (index < 0 || index >= buttons.length) {
        return;
    }

    const button = buttons[index];
    const colorPick = await vscode.window.showQuickPick(COLOR_OPTIONS, {
        title: `Change Color: ${button.name}`,
        placeHolder: 'Choose a new color',
    });

    if (!colorPick) {
        return;
    }

    const updatedButtons = [...buttons];
    updatedButtons[index] = { ...button, backgroundColor: colorPick.colorName } as ButtonConfig;
    await writeButtons(updatedButtons);
    vscode.window.showInformationMessage(`Action Buttons: Changed color for "${button.name}".`);
}

/**
 * Context menu action: **Change Icon**.
 *
 * Shows an icon picker for the right-clicked button.
 *
 * @param args - Arguments passed by VS Code. `args.id` is the status bar item ID.
 */
export async function contextChangeIcon(args: { id: string }): Promise<void> {
    const index = extractButtonIndex(args.id);
    const buttons = readButtons();

    if (index < 0 || index >= buttons.length) {
        return;
    }

    const button = buttons[index];
    const iconPick = await vscode.window.showQuickPick(ICON_CATALOG, {
        title: `Change Icon: ${button.name}`,
        placeHolder: 'Choose a new icon',
    });

    if (!iconPick) {
        return;
    }

    const updatedButtons = [...buttons];
    updatedButtons[index] = { ...button, icon: iconPick.iconId } as ButtonConfig;
    await writeButtons(updatedButtons);
    vscode.window.showInformationMessage(`Action Buttons: Changed icon for "${button.name}".`);
}

/**
 * Context menu action: **Move Left**.
 *
 * Swaps the right-clicked button with the one to its left (lower index)
 * in the configuration array.
 *
 * @param args - Arguments passed by VS Code. `args.id` is the status bar item ID.
 */
export async function contextMoveLeft(args: { id: string }): Promise<void> {
    const index = extractButtonIndex(args.id);
    const buttons = readButtons();

    if (index <= 0 || index >= buttons.length) {
        vscode.window.showInformationMessage('Action Buttons: Button is already at the leftmost position.');
        return;
    }

    const updatedButtons = [...buttons];
    // Swap with the previous button
    [updatedButtons[index - 1], updatedButtons[index]] = [updatedButtons[index], updatedButtons[index - 1]];

    await writeButtons(updatedButtons);
}

/**
 * Context menu action: **Move Right**.
 *
 * Swaps the right-clicked button with the one to its right (higher index)
 * in the configuration array.
 *
 * @param args - Arguments passed by VS Code. `args.id` is the status bar item ID.
 */
export async function contextMoveRight(args: { id: string }): Promise<void> {
    const index = extractButtonIndex(args.id);
    const buttons = readButtons();

    if (index < 0 || index >= buttons.length - 1) {
        vscode.window.showInformationMessage('Action Buttons: Button is already at the rightmost position.');
        return;
    }

    const updatedButtons = [...buttons];
    // Swap with the next button
    [updatedButtons[index], updatedButtons[index + 1]] = [updatedButtons[index + 1], updatedButtons[index]];

    await writeButtons(updatedButtons);
}

/**
 * Context menu action: **Remove Button**.
 *
 * Removes the right-clicked button after a confirmation prompt.
 *
 * @param args - Arguments passed by VS Code. `args.id` is the status bar item ID.
 */
export async function contextRemoveButton(args: { id: string }): Promise<void> {
    const index = extractButtonIndex(args.id);
    const buttons = readButtons();

    if (index < 0 || index >= buttons.length) {
        return;
    }

    const button = buttons[index];
    const confirmation = await vscode.window.showWarningMessage(
        `Remove button "${button.name}"?`,
        { modal: true },
        'Remove',
    );

    if (confirmation !== 'Remove') {
        return;
    }

    const updatedButtons = buttons.filter((_, i) => i !== index);
    await writeButtons(updatedButtons);
    vscode.window.showInformationMessage(`Action Buttons: Removed "${button.name}".`);
}
