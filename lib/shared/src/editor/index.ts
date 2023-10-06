import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { CodyPrompt } from '../chat/prompts'

export interface ActiveTextEditor {
    content: string
    filePath: string
    fileUri?: URI
    repoName?: string
    revision?: string
    selectionRange?: ActiveTextEditorSelectionRange
}

export interface ActiveTextEditorSelectionRange {
    start: {
        line: number
        character: number
    }
    end: {
        line: number
        character: number
    }
}

export interface ActiveTextEditorSelection {
    fileName: string
    fileUri?: URI
    repoName?: string
    revision?: string
    precedingText: string
    selectedText: string
    followingText: string
    selectionRange?: ActiveTextEditorSelectionRange | null
}

export type ActiveTextEditorDiagnosticType = 'error' | 'warning' | 'information' | 'hint'

export interface ActiveTextEditorDiagnostic {
    type: ActiveTextEditorDiagnosticType
    range: ActiveTextEditorSelectionRange
    text: string
    message: string
}

export interface ActiveTextEditorVisibleContent {
    content: string
    fileName: string
    fileUri?: URI
    repoName?: string
    revision?: string
}

export interface VsCodeInlineController {
    selection: ActiveTextEditorSelection | null
    selectionRange: ActiveTextEditorSelectionRange | null
    error(): Promise<void>
}

export interface VsCodeFixupTaskRecipeData {
    instruction: string
    fileName: string
    precedingText: string
    selectedText: string
    followingText: string
    selectionRange: ActiveTextEditorSelectionRange
}

export interface VsCodeFixupController {
    getTaskRecipeData(taskId: string): Promise<VsCodeFixupTaskRecipeData | undefined>
    resetSelectionRange(taskid: string, newRange: vscode.Range): Promise<void>
}

export interface VsCodeCommandsController {
    addCommand(key: string, input?: string): Promise<string>
    getCommand(commandRunnerId: string): CodyPrompt | null
    menu(type: 'custom' | 'config' | 'default', showDesc?: boolean): Promise<void>
}

export interface ActiveTextEditorViewControllers<
    I extends VsCodeInlineController = VsCodeInlineController,
    F extends VsCodeFixupController = VsCodeFixupController,
    C extends VsCodeCommandsController = VsCodeCommandsController,
> {
    readonly inline?: I
    readonly fixups?: F
    readonly command?: C
}

export interface Editor<
    I extends VsCodeInlineController = VsCodeInlineController,
    F extends VsCodeFixupController = VsCodeFixupController,
    P extends VsCodeCommandsController = VsCodeCommandsController,
> {
    controllers?: ActiveTextEditorViewControllers<I, F, P>

    /**
     * The path of the workspace root if on the file system, otherwise `null`.
     *
     * @deprecated Use {@link Editor.getWorkspaceRootUri} instead.
     */
    getWorkspaceRootPath(): string | null

    /** The URI of the workspace root. */
    getWorkspaceRootUri(): URI | null

    getActiveTextEditor(): ActiveTextEditor | null
    getActiveTextEditorSelection(): ActiveTextEditorSelection | null
    getActiveTextEditorSmartSelection(): Promise<ActiveTextEditorSelection | null>
    getActiveFixupTextEditorSmartSelection(): Promise<vscode.Range | null>
    getActiveInlineChatTextEditor(): ActiveTextEditor | null
    getActiveInlineChatSelection(): ActiveTextEditorSelection | null

    /**
     * Gets the active text editor's selection, or the entire file if the selected range is empty.
     */
    getActiveTextEditorSelectionOrEntireFile(): ActiveTextEditorSelection | null
    /**
     * Gets the active text editor's selection, or the visible content if the selected range is empty.
     */
    getActiveTextEditorSelectionOrVisibleContent(): ActiveTextEditorSelection | null
    /**
     * Get diagnostics (errors, warnings, hints) for a range within the active text editor.
     */
    getActiveTextEditorDiagnosticsForRange(range: ActiveTextEditorSelectionRange): ActiveTextEditorDiagnostic[] | null

    getActiveTextEditorVisibleContent(): ActiveTextEditorVisibleContent | null
    replaceSelection(fileName: string, selectedText: string, replacement: string): Promise<void>
    showQuickPick(labels: string[]): Promise<string | undefined>
    showWarningMessage(message: string): Promise<void>
    showInputBox(prompt?: string): Promise<string | undefined>

    // TODO: When Non-Stop Fixup doesn't depend directly on the chat view,
    // move the recipe to vscode and remove this entrypoint.
    didReceiveFixupText(id: string, text: string, state: 'streaming' | 'complete'): Promise<void>
}

export class NoopEditor implements Editor {
    public controllers?:
        | ActiveTextEditorViewControllers<VsCodeInlineController, VsCodeFixupController, VsCodeCommandsController>
        | undefined

    public getWorkspaceRootPath(): string | null {
        return null
    }

    public getWorkspaceRootUri(): URI | null {
        return null
    }

    public getActiveTextEditor(): ActiveTextEditor | null {
        return null
    }

    public getActiveTextEditorSelection(): ActiveTextEditorSelection | null {
        return null
    }

    public getActiveTextEditorSmartSelection(): Promise<ActiveTextEditorSelection | null> {
        return Promise.resolve(null)
    }

    public getActiveFixupTextEditorSmartSelection(): Promise<vscode.Range | null> {
        return Promise.resolve(null)
    }

    public getActiveInlineChatTextEditor(): ActiveTextEditor | null {
        return null
    }

    public getActiveInlineChatSelection(): ActiveTextEditorSelection | null {
        return null
    }

    public getActiveTextEditorSelectionOrEntireFile(): ActiveTextEditorSelection | null {
        return null
    }

    public getActiveTextEditorSelectionOrVisibleContent(): ActiveTextEditorSelection | null {
        return null
    }

    public getActiveTextEditorDiagnosticsForRange(): ActiveTextEditorDiagnostic[] | null {
        return null
    }

    public getActiveTextEditorVisibleContent(): ActiveTextEditorVisibleContent | null {
        return null
    }

    public replaceSelection(_fileName: string, _selectedText: string, _replacement: string): Promise<void> {
        return Promise.resolve()
    }

    public showQuickPick(_labels: string[]): Promise<string | undefined> {
        return Promise.resolve(undefined)
    }

    public showWarningMessage(_message: string): Promise<void> {
        return Promise.resolve()
    }

    public showInputBox(_prompt?: string): Promise<string | undefined> {
        return Promise.resolve(undefined)
    }

    public didReceiveFixupText(id: string, text: string, state: 'streaming' | 'complete'): Promise<void> {
        return Promise.resolve()
    }
}
