/**
 * @file buttonManager.ts
 * @description Manages the lifecycle of status bar action buttons.
 *
 * The {@link ButtonManager} class is the central orchestrator for the
 * extension. It reads button configurations from workspace settings,
 * creates corresponding {@link vscode.StatusBarItem} instances, wires
 * up click handlers, and handles the "+" add-button item.
 *
 * Responsibilities:
 * - Creating, positioning, and styling status bar items
 * - Registering per-button VS Code commands
 * - Showing loading spinners during command execution
 * - Refreshing the button bar when configuration changes
 * - Disposing all resources on deactivation
 *
 * @example
 * ```ts
 * const manager = new ButtonManager(context);
 * manager.refresh();
 *
 * // On extension deactivation:
 * manager.dispose();
 * ```
 */

import * as vscode from 'vscode';

import {
    ButtonConfig,
    GlobalConfig,
    SemanticColor,
    SEMANTIC_BACKGROUND_COLOR_MAP,
    SEMANTIC_FOREGROUND_COLOR_MAP,
    CONFIG_NAMESPACE,
    COMMAND_PREFIX,
    ADD_BUTTON_COMMAND,
    ADD_BUTTON_PRIORITY,
    BUTTON_PRIORITY_BASE,
} from './configTypes';
import { executeButtonAction } from './commandRunner';

// ─── ButtonManager Class ─────────────────────────────────────────────────────

/**
 * Manages the creation, display, and lifecycle of action buttons in the
 * VS Code status bar.
 *
 * Each instance maintains its own set of status bar items and registered
 * command disposables. Calling {@link refresh} tears down the existing
 * buttons and rebuilds them from the current configuration.
 *
 * The class implements {@link vscode.Disposable} for clean teardown.
 */
export class ButtonManager implements vscode.Disposable {

    /** Status bar items currently displayed (action buttons + the "+" button). */
    private statusBarItems: vscode.StatusBarItem[] = [];

    /** Disposables for dynamically registered per-button commands. */
    private commandDisposables: vscode.Disposable[] = [];

    /** Set of button IDs currently executing (used for spinner display). */
    private runningButtons: Set<string> = new Set();

    /** The "+" add-button status bar item (always visible). */
    private addButtonItem: vscode.StatusBarItem | null = null;

    /**
     * Creates a new ButtonManager.
     *
     * @param context - The extension context, used for registering
     *                  disposables that are automatically cleaned up.
     */
    constructor(private readonly context: vscode.ExtensionContext) {}

    // ── Public Methods ───────────────────────────────────────────────────

    /**
     * Reads the current configuration and rebuilds all status bar buttons.
     *
     * This method is safe to call multiple times — it disposes existing
     * items before creating new ones. It should be called:
     * - On extension activation
     * - When the configuration changes
     * - When the user explicitly requests a refresh
     */
    public refresh(): void {
        // Tear down existing buttons (but not the "+" button)
        this.disposeButtons();

        // Read configuration
        const globalConfig = this.readGlobalConfig();
        const buttons = this.readButtonConfigs();

        // Create the "+" add-button (only if it doesn't already exist)
        this.ensureAddButton();

        // Create a status bar item for each configured button
        for (let index = 0; index < buttons.length; index++) {
            const buttonConfig = buttons[index];
            this.createButtonItem(buttonConfig, index, globalConfig);
        }
    }

    /**
     * Disposes all managed resources — status bar items, command
     * registrations, and the "+" button.
     *
     * Called during extension deactivation.
     */
    public dispose(): void {
        this.disposeButtons();
        this.disposeAddButton();
    }

    // ── Configuration Reading ────────────────────────────────────────────

    /**
     * Reads the global extension settings from workspace configuration.
     *
     * @returns The current global settings with defaults applied.
     */
    private readGlobalConfig(): GlobalConfig {
        const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);

        return {
            defaultColor:   config.get<string>('defaultColor', '#FFFFFF'),
            showInTerminal: config.get<boolean>('showInTerminal', true),
            reloadOnSave:   config.get<boolean>('reloadOnSave', false),
        };
    }

    /**
     * Reads the array of button configurations from workspace settings.
     *
     * @returns An array of button configs, or an empty array if none are defined.
     */
    private readButtonConfigs(): ButtonConfig[] {
        const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
        return config.get<ButtonConfig[]>('buttons', []);
    }

    // ── Button Creation ──────────────────────────────────────────────────

    /**
     * Creates a single status bar item for the given button configuration.
     *
     * Registers a unique VS Code command for the button's click handler
     * and applies styling (icon, color, tooltip, priority).
     *
     * @param buttonConfig - The button's configuration.
     * @param index        - The button's index in the configuration array
     *                       (used for generating a unique command ID).
     * @param globalConfig - Global extension settings for defaults.
     */
    private createButtonItem(
        buttonConfig: ButtonConfig,
        index: number,
        globalConfig: GlobalConfig,
    ): void {
        const commandId = `${COMMAND_PREFIX}.${index}`;
        const priority = BUTTON_PRIORITY_BASE + (buttonConfig.priority ?? 0);

        // Create the status bar item
        const item = vscode.window.createStatusBarItem(
            commandId,                       // Unique ID for context menu
            vscode.StatusBarAlignment.Left,
            priority,
        );

        // Configure display text with optional icon
        item.text = this.formatButtonText(buttonConfig);

        // Apply foreground color: explicit `color` > semantic mapping > global default
        const fgColor = this.resolveButtonForeground(buttonConfig, globalConfig);
        item.color = fgColor;

        // Apply background color via ThemeColor (if a semantic color is specified)
        const bgColor = this.resolveButtonBackground(buttonConfig);
        item.backgroundColor = bgColor;

        // Debug logging for color diagnostics
        console.log(`[ActionButtons] Button "${buttonConfig.name}": fg=${fgColor}, bg=${bgColor ? JSON.stringify(bgColor) : 'none'}, configBg=${buttonConfig.backgroundColor ?? 'none'}`);

        // Set tooltip (falls back to the command string)
        item.tooltip = this.formatTooltip(buttonConfig);

        // Set the human-readable name for the status bar context menu
        item.name = `Action Button: ${buttonConfig.name}`;

        // Wire up the click handler command
        item.command = commandId;

        // Register the command that runs when the button is clicked
        const commandDisposable = vscode.commands.registerCommand(
            commandId,
            () => this.onButtonClick(buttonConfig, commandId, item),
        );

        // Track disposables for cleanup
        this.commandDisposables.push(commandDisposable);
        this.context.subscriptions.push(commandDisposable);
        this.statusBarItems.push(item);

        // Show the button
        item.show();
    }

    /**
     * Ensures the "+" add-button exists in the status bar.
     * Creates it only once — subsequent calls are no-ops.
     */
    private ensureAddButton(): void {
        if (this.addButtonItem) {
            return;
        }

        const item = vscode.window.createStatusBarItem(
            'actionButtons.addButton',
            vscode.StatusBarAlignment.Left,
            ADD_BUTTON_PRIORITY,
        );

        item.text = '$(add)';
        item.tooltip = 'Add Action Button';
        item.name = 'Action Buttons: Add';
        item.command = ADD_BUTTON_COMMAND;
        item.color = '#888888';

        item.show();
        this.addButtonItem = item;
    }

    // ── Click Handler ────────────────────────────────────────────────────

    /**
     * Handles a button click event.
     *
     * Performs the following sequence:
     * 1. Shows a confirmation dialog (if `confirm` is enabled)
     * 2. Displays a loading spinner on the button
     * 3. Executes the button's action via {@link executeButtonAction}
     * 4. Restores the button's original text
     *
     * @param config    - The button's configuration.
     * @param commandId - The unique command ID for this button.
     * @param item      - The status bar item to update during execution.
     */
    private async onButtonClick(
        config: ButtonConfig,
        commandId: string,
        item: vscode.StatusBarItem,
    ): Promise<void> {
        // Guard: don't allow re-entry while already running (unless single-instance)
        if (this.runningButtons.has(commandId) && (config.singleInstance ?? true)) {
            // Already running in single-instance mode — the runner will
            // dispose the previous terminal, so let it proceed
        }

        // Show confirmation dialog if required
        if (config.confirm) {
            const confirmed = await vscode.window.showWarningMessage(
                `Run "${config.name}"?`,
                { modal: true },
                'Run',
            );

            if (confirmed !== 'Run') {
                return;
            }
        }

        // Save original text and show loading spinner
        const originalText = item.text;
        this.runningButtons.add(commandId);
        item.text = `$(loading~spin) ${config.name}`;

        try {
            await executeButtonAction(config, commandId);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(
                `Action Buttons: Error running "${config.name}": ${message}`,
            );
        } finally {
            // Restore original text after execution
            this.runningButtons.delete(commandId);
            item.text = originalText;
        }
    }

    // ── Styling Helpers ──────────────────────────────────────────────────

    /**
     * Formats the display text for a status bar item.
     *
     * Combines the optional codicon icon with the button name:
     * - With icon:    `$(play) Build`
     * - Without icon: `Build`
     *
     * @param config - The button's configuration.
     * @returns The formatted text string.
     */
    private formatButtonText(config: ButtonConfig): string {
        if (config.icon) {
            return `$(${config.icon}) ${config.name}`;
        }
        return config.name;
    }

    /**
     * Resolves the foreground (text/icon) color for a button.
     *
     * Priority order:
     * 1. Explicit `color` property (hex or CSS name)
     * 2. `backgroundColor` mapped to a foreground color via {@link SEMANTIC_FOREGROUND_COLOR_MAP}
     * 3. Global `defaultColor` setting
     *
     * @param config       - The button's configuration.
     * @param globalConfig - Global extension settings.
     * @returns The resolved foreground color string.
     */
    private resolveButtonForeground(config: ButtonConfig, globalConfig: GlobalConfig): string {
        // Explicit color takes highest precedence
        if (config.color) {
            return config.color;
        }

        // If a semantic background color is set, use the matching foreground
        if (config.backgroundColor) {
            const semanticColor = config.backgroundColor as SemanticColor;
            const fgColor = SEMANTIC_FOREGROUND_COLOR_MAP[semanticColor];
            if (fgColor) {
                return fgColor;
            }
        }

        // Fall back to the global default
        return globalConfig.defaultColor;
    }

    /**
     * Resolves the background color for a button as a {@link vscode.ThemeColor}.
     *
     * Maps the semantic `backgroundColor` name (e.g., `"green"`) to a
     * registered ThemeColor ID. Uses built-in error/warning backgrounds
     * for red/yellow and custom `contributes.colors` for green/blue/purple/teal.
     *
     * @param config - The button's configuration.
     * @returns A `ThemeColor` for the background, or `undefined` if no
     *          semantic color is specified.
     */
    private resolveButtonBackground(config: ButtonConfig): vscode.ThemeColor | undefined {
        if (!config.backgroundColor) {
            return undefined;
        }

        const semanticColor = config.backgroundColor as SemanticColor;
        const themeColorId = SEMANTIC_BACKGROUND_COLOR_MAP[semanticColor];

        if (themeColorId) {
            return new vscode.ThemeColor(themeColorId);
        }

        return undefined;
    }

    /**
     * Formats the tooltip for a button.
     *
     * Uses the explicit tooltip if provided, otherwise generates one
     * from the command type and command string.
     *
     * @param config - The button's configuration.
     * @returns A descriptive tooltip string.
     */
    private formatTooltip(config: ButtonConfig): string {
        if (config.tooltip) {
            return config.tooltip;
        }

        const commandType = config.commandType ?? 'terminal';

        switch (commandType) {
            case 'terminal':
                return config.command
                    ? `Run: ${config.command}`
                    : `Run button "${config.name}"`;

            case 'vscode':
                return config.command
                    ? `Execute: ${config.command}`
                    : `VS Code command`;

            case 'script':
                return config.command
                    ? `Run script: ${config.command}`
                    : `Run script`;

            case 'macro':
                return config.commands
                    ? `Macro: ${config.commands.length} step(s)`
                    : `Multi-step macro`;

            default:
                return config.name;
        }
    }

    // ── Disposal ─────────────────────────────────────────────────────────

    /**
     * Disposes all action button status bar items and their associated
     * command registrations. Does **not** dispose the "+" button.
     */
    private disposeButtons(): void {
        for (const item of this.statusBarItems) {
            item.dispose();
        }
        this.statusBarItems = [];

        for (const disposable of this.commandDisposables) {
            disposable.dispose();
        }
        this.commandDisposables = [];

        this.runningButtons.clear();
    }

    /**
     * Disposes the "+" add-button status bar item.
     */
    private disposeAddButton(): void {
        if (this.addButtonItem) {
            this.addButtonItem.dispose();
            this.addButtonItem = null;
        }
    }
}
