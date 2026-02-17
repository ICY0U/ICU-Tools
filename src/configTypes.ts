/**
 * @file configTypes.ts
 * @description Type definitions and constants for the Action Buttons extension.
 *
 * Defines all configuration interfaces, enumerations, and color mappings
 * used throughout the extension. These types mirror the JSON schema declared
 * in `package.json` under `contributes.configuration`.
 */

// ─── Command Type Enumeration ────────────────────────────────────────────────

/**
 * Discriminator for the type of action a button performs.
 *
 * - `terminal`  — Executes a shell command in the integrated terminal.
 * - `vscode`   — Invokes a VS Code editor command by its command ID.
 * - `script`   — Runs a script file (`.bat`, `.ps1`, `.sh`, `.py`).
 * - `macro`    — Executes an ordered sequence of {@link MacroStep} entries.
 */
export type CommandType = 'terminal' | 'vscode' | 'script' | 'macro';

// ─── Semantic Color Names ────────────────────────────────────────────────────

/**
 * Predefined semantic color names that map to foreground hex values.
 *
 * These provide a convenient shorthand so users can write
 * `"backgroundColor": "green"` instead of specifying a raw hex color.
 */
export type SemanticColor = 'green' | 'yellow' | 'orange' | 'red' | 'blue' | 'purple' | 'teal';

/**
 * Maps each {@link SemanticColor} name to a VS Code ThemeColor ID for
 * the status bar item background.
 *
 * **Important**: VS Code only renders status bar backgrounds for two
 * built-in ThemeColor IDs:
 * - `statusBarItem.errorBackground`   — renders a red background
 * - `statusBarItem.warningBackground` — renders a yellow/orange background
 *
 * Custom ThemeColor IDs (e.g., from `contributes.colors`) are silently
 * ignored by the status bar renderer (confirmed in vscode.d.ts).
 * Colors without a working background use `undefined` and rely on
 * distinctive vivid foreground colors instead.
 */
export const SEMANTIC_BACKGROUND_COLOR_MAP: Readonly<Record<SemanticColor, string | undefined>> = {
    red:    'statusBarItem.errorBackground',
    yellow: 'statusBarItem.warningBackground',
    orange: 'statusBarItem.warningBackground',
    green:  undefined,
    blue:   undefined,
    purple: undefined,
    teal:   undefined,
} as const;

/**
 * Maps each {@link SemanticColor} name to a foreground hex color value.
 *
 * Buttons with a real background (red, yellow, orange) use white text
 * for contrast. Buttons without a background use bright, distinctive
 * foreground colors to visually differentiate them in the status bar.
 */
export const SEMANTIC_FOREGROUND_COLOR_MAP: Readonly<Record<SemanticColor, string>> = {
    red:    '#FFFFFF',
    yellow: '#000000',
    orange: '#000000',
    green:  '#00FF7F',
    blue:   '#00BFFF',
    purple: '#FF7FFF',
    teal:   '#00FFCC',
} as const;

// ─── Macro Step ──────────────────────────────────────────────────────────────

/**
 * A single step within a multi-step macro.
 *
 * Macros are executed sequentially — each step completes (or starts, for
 * terminal commands) before the next step begins.
 */
export interface MacroStep {
    /** The type of action this step performs. Cannot be `macro` (no nesting). */
    readonly type: Exclude<CommandType, 'macro'>;

    /** The command string: a shell command, VS Code command ID, or script path. */
    readonly command: string;

    /**
     * Delay in milliseconds to wait **after** this step before executing
     * the next one. Defaults to `0` (no delay).
     */
    readonly delay?: number;
}

// ─── Button Configuration ────────────────────────────────────────────────────

/**
 * Complete configuration for a single action button.
 *
 * This interface maps 1:1 to the JSON schema defined in `package.json`
 * under `actionButtons.buttons[*]`.
 */
export interface ButtonConfig {
    /** Button label displayed in the status bar. */
    readonly name: string;

    /**
     * The command to execute.
     *
     * - For `terminal`: a shell command string (e.g., `"npm run build"`).
     * - For `vscode`:   a VS Code command ID (e.g., `"editor.action.formatDocument"`).
     * - For `script`:   a file path relative to the workspace or absolute.
     * - For `macro`:    ignored — use {@link commands} instead.
     */
    readonly command?: string;

    /**
     * The type of command this button executes.
     * @default "terminal"
     */
    readonly commandType?: CommandType;

    /**
     * Ordered list of macro steps. Only used when {@link commandType} is `"macro"`.
     * Each step is executed sequentially.
     */
    readonly commands?: readonly MacroStep[];

    /**
     * Codicon icon name displayed before the button label.
     * @example "play", "terminal", "beaker"
     * @see https://microsoft.github.io/vscode-codicons/dist/codicon.html
     */
    readonly icon?: string;

    /**
     * Foreground text color as a hex value or CSS color name.
     * Takes precedence over {@link backgroundColor} if both are specified.
     * @example "#4EC9B0", "white"
     */
    readonly color?: string;

    /**
     * Semantic color name mapped to a foreground hex value.
     * Provides a convenient shorthand for color-coding buttons.
     * @see {@link SEMANTIC_COLOR_MAP}
     */
    readonly backgroundColor?: SemanticColor;

    /** Hover tooltip text. If omitted, defaults to the command string. */
    readonly tooltip?: string;

    /**
     * When `true`, disposes the previous terminal before creating a new one.
     * Ensures only one instance of this button's terminal exists at a time.
     * @default true
     */
    readonly singleInstance?: boolean;

    /**
     * When `true`, focuses the terminal panel after the command starts.
     * Set to `false` for background tasks that shouldn't steal focus.
     * @default true
     */
    readonly focus?: boolean;

    /**
     * When `true`, shows a confirmation dialog before executing.
     * Recommended for destructive or deployment commands.
     * @default false
     */
    readonly confirm?: boolean;

    /**
     * Working directory for the command. Supports variable substitution
     * (e.g., `"${workspaceFolder}/packages/api"`).
     */
    readonly cwd?: string;

    /**
     * Environment variables to inject into the terminal session.
     * @example { "NODE_ENV": "production", "DEBUG": "true" }
     */
    readonly env?: Readonly<Record<string, string>>;

    /**
     * Position priority in the status bar.
     * Higher values place the button further to the **left**.
     * @default 0
     */
    readonly priority?: number;
}

// ─── Global Extension Settings ───────────────────────────────────────────────

/**
 * Global configuration settings for the Action Buttons extension.
 *
 * These settings apply across all buttons and are defined under
 * the `actionButtons.*` namespace in VS Code settings.
 */
export interface GlobalConfig {
    /**
     * Default foreground text color applied to buttons that do not
     * specify their own {@link ButtonConfig.color} or {@link ButtonConfig.backgroundColor}.
     * @default "#FFFFFF"
     */
    readonly defaultColor: string;

    /**
     * Whether to show command output in the integrated terminal.
     * @default true
     */
    readonly showInTerminal: boolean;

    /**
     * Whether to automatically reload buttons when `settings.json` is saved.
     * @default false
     */
    readonly reloadOnSave: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Extension configuration namespace used with `vscode.workspace.getConfiguration()`. */
export const CONFIG_NAMESPACE = 'actionButtons';

/** Prefix for dynamically registered per-button run commands. */
export const COMMAND_PREFIX = 'actionButtons.run';

/** Command ID for the "+" add-button action. */
export const ADD_BUTTON_COMMAND = 'actionButtons.addButton';

/** Command ID for the refresh action. */
export const REFRESH_COMMAND = 'actionButtons.refresh';

/** Command ID for the edit-button action. */
export const EDIT_BUTTON_COMMAND = 'actionButtons.editButton';

/** Command ID for the remove-button action. */
export const REMOVE_BUTTON_COMMAND = 'actionButtons.removeButton';

// ─── Context Menu Command IDs ────────────────────────────────────────────────

/** Command ID for the context menu "Edit Button" action. */
export const CONTEXT_EDIT_COMMAND = 'actionButtons.contextEdit';

/** Command ID for the context menu "Move Left" action. */
export const CONTEXT_MOVE_LEFT_COMMAND = 'actionButtons.contextMoveLeft';

/** Command ID for the context menu "Move Right" action. */
export const CONTEXT_MOVE_RIGHT_COMMAND = 'actionButtons.contextMoveRight';

/** Command ID for the context menu "Remove Button" action. */
export const CONTEXT_REMOVE_COMMAND = 'actionButtons.contextRemove';

/** Command ID for the context menu "Change Color" action. */
export const CONTEXT_CHANGE_COLOR_COMMAND = 'actionButtons.contextChangeColor';

/** Command ID for the context menu "Change Icon" action. */
export const CONTEXT_CHANGE_ICON_COMMAND = 'actionButtons.contextChangeIcon';

/** Command ID for the context menu "Change Command" action. */
export const CONTEXT_CHANGE_COMMAND_COMMAND = 'actionButtons.contextChangeCommand';

/**
 * Base priority for the "+" button in the status bar.
 * Set low so it appears to the right of all action buttons.
 */
export const ADD_BUTTON_PRIORITY = -1000;

/**
 * Base priority offset for action buttons.
 * Individual button priorities are added to this value.
 */
export const BUTTON_PRIORITY_BASE = 0;

/** Supported script file extensions and their associated interpreters. */
export const SCRIPT_INTERPRETERS: Readonly<Record<string, string>> = {
    '.py':   'python',
    '.ps1':  'powershell',
    '.sh':   'bash',
    '.bash': 'bash',
    '.bat':  '',   // Runs directly on Windows
    '.cmd':  '',   // Runs directly on Windows
} as const;

/**
 * File extension filter for the script file picker dialog.
 * Used when browsing for script files to attach to a button.
 */
export const SCRIPT_FILE_FILTERS: Readonly<Record<string, readonly string[]>> = {
    'Script Files': ['bat', 'cmd', 'ps1', 'sh', 'bash', 'py'],
    'All Files':    ['*'],
} as const;
