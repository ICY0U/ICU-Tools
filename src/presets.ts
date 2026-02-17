/**
 * @file presets.ts
 * @description Preset button configurations for common development workflows.
 *
 * Provides ready-made button sets for popular project types (Web, Node.js,
 * Python, Rust, Docker, etc.) that can be selected from a Quick Pick menu.
 * Presets are applied by writing to the workspace's `actionButtons.buttons`
 * setting.
 *
 * @example
 * ```ts
 * // Called from the "+" button when no buttons are configured:
 * await showPresetPicker();
 * ```
 */

import * as vscode from 'vscode';

import { ButtonConfig, CONFIG_NAMESPACE } from './configTypes';

// ─── Preset Definitions ──────────────────────────────────────────────────────

/**
 * A named collection of {@link ButtonConfig} entries representing a
 * typical workflow for a specific project type.
 */
interface Preset {
    /** Display label for the Quick Pick. */
    readonly label: string;

    /** Short description shown below the label. */
    readonly description: string;

    /** Codicon icon rendered before the label. */
    readonly icon: string;

    /** The button configurations included in this preset. */
    readonly buttons: readonly ButtonConfig[];
}

/**
 * All available preset configurations.
 *
 * Each preset targets a common project type and includes a sensible
 * default set of action buttons.
 */
const PRESETS: readonly Preset[] = [

    // ── Web / Frontend ───────────────────────────────────────────────
    {
        label: 'Web / Frontend',
        description: 'npm dev, build, preview, lint, test',
        icon: 'globe',
        buttons: [
            {
                name: 'Dev',
                command: 'npm run dev',
                icon: 'play',
                backgroundColor: 'green',
                singleInstance: true,
            },
            {
                name: 'Build',
                command: 'npm run build',
                icon: 'package',
                backgroundColor: 'yellow',
            },
            {
                name: 'Preview',
                command: 'npm run preview',
                icon: 'open-preview',
                backgroundColor: 'blue',
            },
            {
                name: 'Lint',
                command: 'npm run lint',
                icon: 'checklist',
                backgroundColor: 'purple',
            },
            {
                name: 'Test',
                command: 'npm test',
                icon: 'beaker',
                backgroundColor: 'teal',
            },
            {
                name: 'Terminal',
                commandType: 'vscode',
                command: 'actionButtons.toggleTerminalPanel',
                icon: 'terminal',
                backgroundColor: 'teal',
            },
            {
                name: 'Chat',
                commandType: 'vscode',
                command: 'workbench.action.chat.toggle',
                icon: 'comment-discussion',
                backgroundColor: 'purple',
            },
        ],
    },

    // ── Node.js / TypeScript ─────────────────────────────────────────
    {
        label: 'Node.js / TypeScript',
        description: 'dev, bundle, type-check, build & run',
        icon: 'terminal',
        buttons: [
            {
                name: 'Dev',
                command: 'npm run dev',
                icon: 'play',
                backgroundColor: 'green',
                singleInstance: true,
            },
            {
                name: 'Bundle',
                command: 'npm run build',
                icon: 'package',
                backgroundColor: 'yellow',
            },
            {
                name: 'Type Check',
                command: 'npx tsc --noEmit',
                icon: 'tools',
                backgroundColor: 'red',
            },
            {
                name: 'Build & Run',
                command: 'npx tsc && node out/index.js',
                icon: 'run-all',
                backgroundColor: 'blue',
            },
            {
                name: 'Terminal',
                commandType: 'vscode',
                command: 'actionButtons.toggleTerminalPanel',
                icon: 'terminal',
                backgroundColor: 'teal',
            },
            {
                name: 'Chat',
                commandType: 'vscode',
                command: 'workbench.action.chat.toggle',
                icon: 'comment-discussion',
                backgroundColor: 'purple',
            },
        ],
    },

    // ── Python ───────────────────────────────────────────────────────
    {
        label: 'Python',
        description: 'run file, pytest, ruff, black',
        icon: 'file-code',
        buttons: [
            {
                name: 'Run',
                command: 'python ${file}',
                icon: 'play',
                backgroundColor: 'green',
            },
            {
                name: 'Test',
                command: 'pytest -v',
                icon: 'beaker',
                backgroundColor: 'yellow',
            },
            {
                name: 'Lint',
                command: 'ruff check .',
                icon: 'checklist',
                backgroundColor: 'purple',
            },
            {
                name: 'Format',
                command: 'black .',
                icon: 'edit',
                backgroundColor: 'blue',
            },
            {
                name: 'Terminal',
                commandType: 'vscode',
                command: 'actionButtons.toggleTerminalPanel',
                icon: 'terminal',
                backgroundColor: 'teal',
            },
            {
                name: 'Chat',
                commandType: 'vscode',
                command: 'workbench.action.chat.toggle',
                icon: 'comment-discussion',
                backgroundColor: 'purple',
            },
        ],
    },

    // ── Rust ─────────────────────────────────────────────────────────
    {
        label: 'Rust',
        description: 'cargo run, build, release, test, clippy',
        icon: 'gear',
        buttons: [
            {
                name: 'Run',
                command: 'cargo run',
                icon: 'play',
                backgroundColor: 'green',
            },
            {
                name: 'Build',
                command: 'cargo build',
                icon: 'tools',
                backgroundColor: 'yellow',
            },
            {
                name: 'Release',
                command: 'cargo build --release',
                icon: 'package',
                backgroundColor: 'red',
            },
            {
                name: 'Test',
                command: 'cargo test',
                icon: 'beaker',
                backgroundColor: 'blue',
            },
            {
                name: 'Clippy',
                command: 'cargo clippy',
                icon: 'checklist',
                backgroundColor: 'purple',
            },
            {
                name: 'Terminal',
                commandType: 'vscode',
                command: 'actionButtons.toggleTerminalPanel',
                icon: 'terminal',
                backgroundColor: 'teal',
            },
            {
                name: 'Chat',
                commandType: 'vscode',
                command: 'workbench.action.chat.toggle',
                icon: 'comment-discussion',
                backgroundColor: 'purple',
            },
        ],
    },

    // ── C / C++ ──────────────────────────────────────────────────────
    {
        label: 'C / C++',
        description: 'cmake, make, run, debug',
        icon: 'tools',
        buttons: [
            {
                name: 'Configure',
                command: 'cmake -B build -S .',
                icon: 'gear',
                backgroundColor: 'yellow',
            },
            {
                name: 'Build',
                command: 'cmake --build build',
                icon: 'tools',
                backgroundColor: 'green',
            },
            {
                name: 'Clean',
                command: 'cmake --build build --target clean',
                icon: 'trash',
                backgroundColor: 'red',
                confirm: true,
            },
            {
                name: 'Run',
                command: 'cmake --build build && ./build/main',
                icon: 'play',
                backgroundColor: 'blue',
            },
            {
                name: 'Terminal',
                commandType: 'vscode',
                command: 'actionButtons.toggleTerminalPanel',
                icon: 'terminal',
                backgroundColor: 'teal',
            },
            {
                name: 'Chat',
                commandType: 'vscode',
                command: 'workbench.action.chat.toggle',
                icon: 'comment-discussion',
                backgroundColor: 'purple',
            },
        ],
    },

    // ── Docker / DevOps ──────────────────────────────────────────────
    {
        label: 'Docker / DevOps',
        description: 'compose up, down, rebuild, logs, deploy',
        icon: 'server',
        buttons: [
            {
                name: 'Up',
                command: 'docker compose up -d',
                icon: 'play',
                backgroundColor: 'green',
            },
            {
                name: 'Down',
                command: 'docker compose down',
                icon: 'debug-stop',
                backgroundColor: 'red',
                confirm: true,
            },
            {
                name: 'Rebuild',
                command: 'docker compose up -d --build',
                icon: 'refresh',
                backgroundColor: 'yellow',
            },
            {
                name: 'Logs',
                command: 'docker compose logs -f',
                icon: 'output',
                backgroundColor: 'blue',
                singleInstance: true,
            },
            {
                name: 'Deploy',
                command: 'npm run deploy',
                icon: 'cloud-upload',
                backgroundColor: 'purple',
                confirm: true,
            },
            {
                name: 'Terminal',
                commandType: 'vscode',
                command: 'actionButtons.toggleTerminalPanel',
                icon: 'terminal',
                backgroundColor: 'teal',
            },
            {
                name: 'Chat',
                commandType: 'vscode',
                command: 'workbench.action.chat.toggle',
                icon: 'comment-discussion',
                backgroundColor: 'purple',
            },
        ],
    },

    // ── Custom (Empty) ───────────────────────────────────────────────
    {
        label: 'Custom (Start Empty)',
        description: 'No preset — add buttons manually via the "+" button',
        icon: 'edit',
        buttons: [],
    },

    // ── Individual Utility Buttons ───────────────────────────────────
    {
        label: 'Terminal Toggle',
        description: 'Single button to open/close the terminal panel',
        icon: 'terminal',
        buttons: [
            {
                name: 'Terminal',
                commandType: 'vscode',
                command: 'actionButtons.toggleTerminalPanel',
                icon: 'terminal',
                backgroundColor: 'teal',
            },
        ],
    },
    {
        label: 'Chat Toggle',
        description: 'Single button to open/close the Copilot chat panel',
        icon: 'comment-discussion',
        buttons: [
            {
                name: 'Chat',
                commandType: 'vscode',
                command: 'workbench.action.chat.toggle',
                icon: 'comment-discussion',
                backgroundColor: 'purple',
            },
        ],
    },
];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Shows an interactive Quick Pick menu of preset button configurations.
 *
 * The user can select a preset to populate their workspace with a set
 * of pre-configured action buttons. The selected preset is written to
 * the workspace's `.vscode/settings.json` under `actionButtons.buttons`.
 *
 * If the user selects "Custom (Start Empty)", no buttons are written —
 * they can add buttons individually using the "+" button.
 *
 * @returns A promise that resolves when a preset is applied or the
 *          picker is dismissed.
 */
export async function showPresetPicker(): Promise<void> {
    const items = PRESETS.map((preset) => ({
        label: `$(${preset.icon}) ${preset.label}`,
        description: preset.description,
        preset,
    }));

    const selection = await vscode.window.showQuickPick(items, {
        title: 'Action Buttons: Choose a Preset',
        placeHolder: 'Select a project type to get started with pre-configured buttons',
    });

    if (!selection) {
        return; // User cancelled
    }

    const { preset } = selection;

    // "Custom" preset has no buttons — skip writing
    if (preset.buttons.length === 0) {
        vscode.window.showInformationMessage(
            'Action Buttons: Starting empty. Use the "+" button to add buttons.',
        );
        return;
    }

    // Check for existing buttons and ask whether to replace or append
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const existingButtons = config.get<ButtonConfig[]>('buttons', []);

    let finalButtons: readonly ButtonConfig[];

    if (existingButtons.length > 0) {
        const action = await vscode.window.showQuickPick(
            [
                {
                    label: '$(add) Add to existing buttons',
                    description: `Append ${preset.buttons.length} button(s) to your current ${existingButtons.length}`,
                    action: 'append' as const,
                },
                {
                    label: '$(replace-all) Replace all buttons',
                    description: `Remove current buttons and use only the preset`,
                    action: 'replace' as const,
                },
            ],
            {
                title: `Apply "${preset.label}"`,
                placeHolder: 'You already have buttons configured — how should the preset be applied?',
            },
        );

        if (!action) {
            return; // User cancelled
        }

        finalButtons = action.action === 'append'
            ? [...existingButtons, ...preset.buttons]
            : preset.buttons;
    } else {
        finalButtons = preset.buttons;
    }

    await config.update(
        'buttons',
        finalButtons,
        vscode.ConfigurationTarget.Workspace,
    );

    vscode.window.showInformationMessage(
        `Action Buttons: Applied "${preset.label}" — now ${finalButtons.length} button(s) total.`,
    );
}
