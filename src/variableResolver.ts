/**
 * @file variableResolver.ts
 * @description Resolves VS Code–style variable placeholders in command strings.
 *
 * VS Code resolves variables like `${workspaceFolder}` internally for
 * `tasks.json` and `launch.json`, but does **not** expose a public API for
 * extensions. This module provides a standalone resolver that supports
 * all standard variables plus `${env:VAR_NAME}` for environment variables.
 *
 * @example
 * ```ts
 * const resolved = resolveVariables('echo ${workspaceFolder}');
 * // → "echo C:\Users\dev\my-project"
 * ```
 */

import * as vscode from 'vscode';
import * as path from 'path';

// ─── Variable Definitions ────────────────────────────────────────────────────

/**
 * Regex pattern matching `${env:VARIABLE_NAME}` placeholders.
 * Captures the environment variable name in group 1.
 */
const ENV_VARIABLE_PATTERN = /\$\{env:([^}]+)\}/g;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolves all supported variable placeholders in the given input string.
 *
 * Supported variables:
 * | Variable                        | Description                          |
 * |---------------------------------|--------------------------------------|
 * | `${workspaceFolder}`            | Workspace root path                  |
 * | `${workspaceFolderBasename}`    | Workspace folder name                |
 * | `${file}`                       | Active file full path                |
 * | `${fileBasename}`               | Active file name                     |
 * | `${fileBasenameNoExtension}`    | Active file name without extension   |
 * | `${fileDirname}`                | Active file directory                |
 * | `${fileExtname}`                | Active file extension (e.g., `.ts`)  |
 * | `${lineNumber}`                 | Current cursor line (1-based)        |
 * | `${selectedText}`               | Currently selected text              |
 * | `${cwd}`                        | Current working directory            |
 * | `${pathSeparator}`              | OS path separator (`\` or `/`)       |
 * | `${env:VAR_NAME}`               | Environment variable value           |
 *
 * @param input - The string containing variable placeholders.
 * @returns The string with all recognized variables replaced by their values.
 *          Unrecognized placeholders are left as-is.
 */
export function resolveVariables(input: string): string {
    const workspaceFolder = getWorkspaceFolderPath();
    const activeFilePath = getActiveFilePath();

    // Build the static replacement table
    const replacements: ReadonlyMap<string, string> = new Map([
        ['${workspaceFolder}',           workspaceFolder],
        ['${workspaceFolderBasename}',   path.basename(workspaceFolder)],
        ['${file}',                      activeFilePath],
        ['${fileBasename}',              path.basename(activeFilePath)],
        ['${fileBasenameNoExtension}',   path.parse(activeFilePath).name],
        ['${fileDirname}',               path.dirname(activeFilePath)],
        ['${fileExtname}',               path.extname(activeFilePath)],
        ['${lineNumber}',                getActiveLineNumber()],
        ['${selectedText}',              getSelectedText()],
        ['${cwd}',                       workspaceFolder],
        ['${pathSeparator}',             path.sep],
    ]);

    // Replace all known static variables
    let result = input;
    for (const [variable, value] of replacements) {
        result = replaceAll(result, variable, value);
    }

    // Replace ${env:VAR_NAME} patterns
    result = result.replace(ENV_VARIABLE_PATTERN, (_match, variableName: string) => {
        return process.env[variableName] ?? '';
    });

    return result;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Returns the filesystem path of the workspace folder most relevant to
 * the currently active editor. In multi-root workspaces, this is the
 * folder containing the active file. Falls back to the first workspace
 * folder, or an empty string if no workspace is open.
 */
function getWorkspaceFolderPath(): string {
    const activeUri = vscode.window.activeTextEditor?.document.uri;

    if (activeUri) {
        const folder = vscode.workspace.getWorkspaceFolder(activeUri);
        if (folder) {
            return folder.uri.fsPath;
        }
    }

    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
}

/**
 * Returns the full filesystem path of the active editor's document.
 * Returns an empty string if no editor is active.
 */
function getActiveFilePath(): string {
    return vscode.window.activeTextEditor?.document.uri.fsPath ?? '';
}

/**
 * Returns the 1-based line number of the cursor in the active editor.
 * Returns `"1"` if no editor is active.
 */
function getActiveLineNumber(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return '1';
    }
    return String(editor.selection.active.line + 1);
}

/**
 * Returns the currently selected text in the active editor.
 * Returns an empty string if nothing is selected or no editor is active.
 */
function getSelectedText(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
        return '';
    }
    return editor.document.getText(editor.selection);
}

/**
 * Replaces all occurrences of `search` with `replacement` in the given string.
 * Uses a simple split-and-join approach for safety with special regex characters.
 *
 * @param source      - The source string.
 * @param search      - The substring to find (literal, not regex).
 * @param replacement - The string to replace each occurrence with.
 * @returns The modified string.
 */
function replaceAll(source: string, search: string, replacement: string): string {
    return source.split(search).join(replacement);
}
