import type { ChatMessage } from '@sourcegraph/cody-shared'
import { type FunctionComponent, useMemo } from 'react'
import type { UserAccountInfo } from '../../../../Chat'
import { UserAvatar } from '../../../../Components/UserAvatar'
import {
    type SerializedPromptEditorValue,
    serializedPromptEditorStateFromChatMessage,
} from '../../../../promptEditor/PromptEditor'
import { BaseMessageCell } from '../BaseMessageCell'
import styles from './HumanMessageCell.module.css'
import { HumanMessageEditor } from './editor/HumanMessageEditor'

// TODO!(sqs): make sure command prompts can't be edited

/**
 * A component that displays a chat message from the human.
 */
export const HumanMessageCell: FunctionComponent<{
    message: ChatMessage | null
    userInfo: UserAccountInfo

    /** Whether this editor is for the first message (not a followup). */
    isFirstMessage: boolean

    onSubmit: (editorValue: SerializedPromptEditorValue, addEnhancedContext: boolean) => void

    /** For use in storybooks only. */
    __storybook__focus?: boolean
}> = ({ message, userInfo, isFirstMessage, onSubmit, __storybook__focus }) => {
    const initialEditorState = useMemo(
        () => (message ? serializedPromptEditorStateFromChatMessage(message) : undefined),
        [message]
    )

    return (
        <BaseMessageCell
            speaker="human"
            speakerIcon={<UserAvatar user={userInfo.user} size={20} className={styles.speakerIcon} />}
            content={
                <HumanMessageEditor
                    initialEditorState={initialEditorState}
                    placeholder={isFirstMessage ? 'Message...' : 'Followup...'}
                    isFirstMessage={isFirstMessage}
                    onSubmit={onSubmit}
                    userInfo={userInfo}
                    __storybook__focus={__storybook__focus}
                />
            }
            contentClassName={styles.editor}
        />
    )
}