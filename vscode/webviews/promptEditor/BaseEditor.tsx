import { type InitialConfigType, LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { EditorRefPlugin } from '@lexical/react/LexicalEditorRefPlugin'
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { clsx } from 'clsx'
import type { EditorState, LexicalEditor, SerializedEditorState } from 'lexical'
import { type FunctionComponent, type RefObject, useMemo } from 'react'
import type { UserAccountInfo } from '../Chat'
import styles from './BaseEditor.module.css'
import { RICH_EDITOR_NODES } from './nodes'
import MentionsPlugin from './plugins/atMentions/atMentions'
import CodeHighlightPlugin from './plugins/codeHighlight'
import { DisableEscapeKeyBlursPlugin } from './plugins/disableEscapeKeyBlurs'
import { KeyboardEventPlugin, type KeyboardEventPluginProps } from './plugins/keyboardEvent'
import { NoRichTextFormatShortcutsPlugin } from './plugins/noRichTextShortcuts'
import { OnFocusChangePlugin } from './plugins/onFocus'

interface Props extends KeyboardEventPluginProps {
    userInfo?: UserAccountInfo
    initialEditorState: SerializedEditorState | null
    onChange: (editorState: EditorState, editor: LexicalEditor) => void
    onFocusChange?: (focused: boolean) => void
    editorRef?: RefObject<LexicalEditor>
    placeholder?: string
    disabled?: boolean
    className?: string
    contentEditableClassName?: string
    'aria-label'?: string
}

/**
 * The low-level rich editor for messages to Cody.
 */
export const BaseEditor: FunctionComponent<Props> = ({
    userInfo,
    initialEditorState,
    onChange,
    onFocusChange,
    editorRef,
    placeholder,
    disabled,
    className,
    contentEditableClassName,
    'aria-label': ariaLabel,
    onEnterKey,
}) => {
    // biome-ignore lint/correctness/useExhaustiveDependencies: We do not want to update initialConfig because LexicalComposer is meant to be an uncontrolled component.
    const initialConfig = useMemo<InitialConfigType>(
        () => ({
            namespace: 'BaseEditor',
            theme: { paragraph: styles.themeParagraph },
            onError: (error: any) => console.error(error),
            editorState: initialEditorState !== null ? JSON.stringify(initialEditorState) : undefined,
            editable: !disabled,
            nodes: RICH_EDITOR_NODES,
        }),
        []
    )

    return (
        <div className={clsx(styles.editorShell, className)}>
            <div className={styles.editorContainer}>
                <LexicalComposer initialConfig={initialConfig}>
                    <RichTextPlugin
                        contentEditable={
                            <div className={styles.editorScroller}>
                                <div className={styles.editor}>
                                    <ContentEditable
                                        className={clsx(
                                            styles.contentEditable,
                                            contentEditableClassName
                                        )}
                                        ariaLabel={ariaLabel}
                                    />
                                </div>
                            </div>
                        }
                        placeholder={<div className={styles.placeholder}>{placeholder}</div>}
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <NoRichTextFormatShortcutsPlugin />
                    <HistoryPlugin />
                    <OnChangePlugin onChange={onChange} ignoreSelectionChange={true} />
                    <MentionsPlugin userInfo={userInfo} />
                    <CodeHighlightPlugin />
                    {onFocusChange && <OnFocusChangePlugin onFocusChange={onFocusChange} />}
                    {editorRef && <EditorRefPlugin editorRef={editorRef} />}
                    <KeyboardEventPlugin onEnterKey={onEnterKey} />
                    <DisableEscapeKeyBlursPlugin />
                </LexicalComposer>
            </div>
        </div>
    )
}
