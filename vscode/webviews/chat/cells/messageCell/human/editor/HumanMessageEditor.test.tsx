import { serializedPromptEditorStateFromText } from '@sourcegraph/cody-shared'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { type Assertion, type Mock, describe, expect, test, vi } from 'vitest'
import { TestAppWrapper } from '../../../../../AppWrapper'
import { FILE_MENTION_EDITOR_STATE_FIXTURE } from '../../../../../promptEditor/fixtures'
import { FIXTURE_USER_ACCOUNT_INFO } from '../../../../fixtures'
import { HumanMessageEditor } from './HumanMessageEditor'

vi.mock('@vscode/webview-ui-toolkit/react', () => ({
    VSCodeButton: vi.fn(),
    VSCodeCheckbox: vi.fn(),
}))

const ENTER_KEYBOARD_EVENT_DATA: Pick<KeyboardEvent, 'key' | 'code' | 'keyCode'> = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
}

describe('HumanMessageEditor', () => {
    test('renders textarea', async () => {
        const { editor } = renderWithMocks({})
        expect(editor).toHaveTextContent('What does @Symbol1')
    })

    describe('states', () => {
        function expectState(
            { mentionButton, submitButton }: ReturnType<typeof renderWithMocks>,
            expected: {
                toolbarVisible?: boolean
                submitButtonVisible?: boolean
                submitButtonEnabled?: boolean
                submitButtonText?: string
            }
        ): void {
            if (expected.toolbarVisible !== undefined) {
                notUnless(expect.soft(mentionButton), expected.toolbarVisible).toBeVisible()
            }
            if (expected.submitButtonVisible !== undefined) {
                notUnless(expect.soft(submitButton), expected.submitButtonVisible).toBeVisible()
            }
            if (expected.submitButtonEnabled !== undefined) {
                notUnless(expect.soft(submitButton), expected.submitButtonEnabled).toBeEnabled()
            }
            if (expected.submitButtonText !== undefined) {
                expect.soft(submitButton).toHaveAccessibleName(expected.submitButtonText)
            }

            function notUnless<T>(assertion: Assertion<T>, value: boolean): Assertion<T> {
                return value ? assertion : assertion.not
            }
        }

        test('!isSent', () => {
            expectState(
                renderWithMocks({
                    initialEditorState: serializedPromptEditorStateFromText('abc'),
                    isSent: false,
                }),
                { toolbarVisible: true, submitButtonEnabled: true, submitButtonText: 'Send' }
            )
        })

        test('isSent && !isPendingResponse', () => {
            const rendered = renderWithMocks({
                initialEditorState: undefined,
                isSent: true,
            })
            expectState(rendered, { toolbarVisible: false })
            fireEvent.focus(rendered.editor)
            expectState(rendered, { toolbarVisible: true })
        })

        test('isPendingPriorResponse', () => {
            const rendered = renderWithMocks({
                initialEditorState: undefined,
                isPendingPriorResponse: true,
            })
            expectState(rendered, { toolbarVisible: true })
        })
    })

    describe('submitting', () => {
        function testNoSubmitting({
            container,
            submitButton,
            onSubmit,
        }: ReturnType<typeof renderWithMocks>): void {
            if (submitButton) {
                expect(submitButton).toBeDisabled()
                // Click
                fireEvent.click(submitButton!)
                expect(onSubmit).toHaveBeenCalledTimes(0)
            }

            // Enter
            const editor = container.querySelector<HTMLElement>('[data-lexical-editor="true"]')!
            fireEvent.keyDown(editor, ENTER_KEYBOARD_EVENT_DATA)
            expect(onSubmit).toHaveBeenCalledTimes(0)
        }

        test('empty editor', () => {
            testNoSubmitting(
                renderWithMocks({
                    initialEditorState: undefined,
                })
            )
        })

        test('isPendingPriorResponse', () => {
            testNoSubmitting(
                renderWithMocks({
                    initialEditorState: serializedPromptEditorStateFromText('abc'),
                    isPendingPriorResponse: true,
                })
            )
        })

        test('submit', async () => {
            const { container, submitButton, onSubmit } = renderWithMocks({
                initialEditorState: FILE_MENTION_EDITOR_STATE_FIXTURE,
            })
            expect(submitButton).toBeEnabled()

            // Click
            fireEvent.click(submitButton!)
            expect(onSubmit).toHaveBeenCalledTimes(1)

            // Enter
            const editor = container.querySelector<HTMLElement>('[data-lexical-editor="true"]')!
            fireEvent.keyDown(editor, ENTER_KEYBOARD_EVENT_DATA)
            expect(onSubmit).toHaveBeenCalledTimes(2)
        })
    })
})

type EditorHTMLElement = HTMLDivElement & { dataset: { lexicalEditor: 'true' } }

function renderWithMocks(props: Partial<ComponentProps<typeof HumanMessageEditor>>): {
    container: HTMLElement
    editor: EditorHTMLElement
    mentionButton: HTMLElement | null
    submitButton: HTMLElement | null
    onChange: Mock
    onSubmit: Mock
} {
    const onChange = vi.fn()
    const onSubmit = vi.fn()

    const DEFAULT_PROPS: React.ComponentProps<typeof HumanMessageEditor> = {
        userInfo: FIXTURE_USER_ACCOUNT_INFO,
        initialEditorState: FILE_MENTION_EDITOR_STATE_FIXTURE,
        placeholder: 'my-placeholder',
        isFirstMessage: true,
        isPendingPriorResponse: false,
        isSent: false,
        onChange,
        onSubmit,
    }

    const { container } = render(<HumanMessageEditor {...DEFAULT_PROPS} {...props} />, {
        wrapper: TestAppWrapper,
    })
    return {
        container,
        editor: container.querySelector<EditorHTMLElement>('[data-lexical-editor="true"]')!,
        mentionButton: screen.queryByRole('button', { name: 'Add context', hidden: true }),
        submitButton: screen.queryByRole('button', {
            name: 'Send',
            hidden: true,
        }),
        onChange,
        onSubmit,
    }
}
