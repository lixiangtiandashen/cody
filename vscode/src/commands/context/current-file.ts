import {
    type ContextItem,
    ContextItemSource,
    TokenCounter,
    contextFiltersProvider,
    logError,
    toRangeData,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getEditor } from '../../editor/active-editor'

export async function getContextFileFromCurrentFile(): Promise<ContextItem | null> {
    return wrapInActiveSpan('commands.context.file', async span => {
        try {
            const editor = getEditor()
            const document = editor?.active?.document
            if (!document) {
                throw new Error('No active editor')
            }

            if (await contextFiltersProvider.isUriIgnored(document.uri)) {
                return null
            }

            // In the current implementation of commands, it's important to specify the full file
            // range here so that the selected range (e.g., for "Explain Code") is emitted
            // separately as context. Otherwise, the model is unlikely to be able to figure out what
            // portion of the file the user actually wants to be explained.
            const selection = new vscode.Selection(
                0,
                0,
                document.lineCount - 1,
                document.lineAt(document.lineCount - 1).text.length
            )

            const content = document.getText(selection)
            const size = TokenCounter.countTokens(content)

            if (!content.trim()) {
                throw new Error('No content')
            }

            return {
                type: 'file',
                uri: document.uri,
                content,
                source: ContextItemSource.Editor,
                range: toRangeData(selection),
                size,
            }
        } catch (error) {
            logError('getContextFileFromCurrentFile', 'failed', { verbose: error })
            return null
        }
    })
}
