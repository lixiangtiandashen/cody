import { getEncoding } from 'js-tiktoken'
import type { TokenUsage } from '.'
import type { ChatContextTokenUsage, TokenUsageType } from '.'
import type { ModelContextWindow } from '..'
import type { Message, PromptString } from '..'
import { ENHANCED_CONTEXT_ALLOCATION } from './constants'

/**
 * A class to manage the token allocation during prompt building.
 */
export class TokenCounter {
    /**
     * The maximum number of tokens that can be used by Chat Messages.
     */
    public readonly maxChatTokens: number
    /**
     * The maximum number of tokens that can be used by each context type:
     * - User-Context: tokens reserved for User-added context, like @-mentions.
     * - Enhanced-Context: % (defined by ENHANCED_CONTEXT_ALLOCATION) of the latest Chat budget.
     */
    public readonly maxContextTokens: ChatContextTokenUsage
    /**
     * The number of tokens used by chat and context respectively.
     */
    private usedTokens: TokenUsage = { preamble: 0, input: 0, user: 0, enhanced: 0 }
    /**
     * Indicates whether the Chat and User-Context share the same token budget.
     * - If true, all types of messages share the same token budget with Chat.
     * - If false (Feature Flag required), the User-Context will has a separated budget.
     * NOTE: Used in remainingTokens for calculating the remaining token budget for each budget type.
     */
    private shareChatAndUserBudget = true

    constructor(contextWindow: ModelContextWindow) {
        // If there is no context window reserved for context.user,
        // context will share the same token budget with chat.
        this.shareChatAndUserBudget = !contextWindow.context?.user
        this.maxChatTokens = contextWindow.input
        this.maxContextTokens = {
            user: contextWindow.context?.user ?? contextWindow.input,
            enhanced: Math.floor(contextWindow.input * ENHANCED_CONTEXT_ALLOCATION),
        }
    }

    /**
     * Updates the token usage for the messages of a specified token usage type.
     *
     * @param type - The type of token usage to update.
     * @param messages - The messages to calculate the token count for.
     * @returns `true` if the token usage can be allocated, `false` otherwise.
     */
    public updateUsage(type: TokenUsageType, messages: Message[]): boolean {
        const count = TokenCounter.getMessagesTokenCount(messages)
        const isWithinLimit = this.canAllocateTokens(type, count)
        if (isWithinLimit) {
            this.usedTokens[type] = this.usedTokens[type] + count
        }
        return isWithinLimit
    }

    /**
     * NOTE: Should only be used by @canAllocateTokens to determine if the token usage can be allocated in correct order.
     *
     * Calculates the remaining token budget for each token usage type.
     *
     * @returns The remaining token budget for chat, User-Context, and Enhanced-Context (if applicable).
     */
    private get remainingTokens() {
        const usedChat = this.usedTokens.preamble + this.usedTokens.input
        const usedUser = this.usedTokens.user
        const usedEnhanced = this.usedTokens.enhanced

        let chat = this.maxChatTokens - usedChat
        let user = this.maxContextTokens.user - usedUser

        // When the context shares the same token budget with Chat...
        if (this.shareChatAndUserBudget) {
            // ...subtracts the tokens used by context from Chat.
            chat -= usedUser + usedEnhanced
            // ...the remaining token budget for User-Context is the same as Chat.
            user = chat
        }

        return {
            chat,
            user,
            enhanced: Math.floor(chat * ENHANCED_CONTEXT_ALLOCATION),
        }
    }

    /**
     * Checks if the specified token usage type has enough remaining tokens to allocate the given count.
     *
     * @param type - The type of token usage to check.
     * @param count - The number of tokens to allocate.
     * @returns `true` if the tokens can be allocated, `false` otherwise.
     */
    private canAllocateTokens(type: TokenUsageType, count: number): boolean {
        switch (type) {
            case 'preamble':
                return this.remainingTokens.chat >= count
            case 'input':
                if (!this.usedTokens.preamble) {
                    throw new Error('Preamble must be updated before Chat input.')
                }
                return this.remainingTokens.chat >= count
            case 'user':
                if (!this.usedTokens.input) {
                    throw new Error('Chat token usage must be updated before Context.')
                }
                return this.remainingTokens.user >= count
            case 'enhanced':
                if (!this.usedTokens.input) {
                    throw new Error('Chat token usage must be updated before Context.')
                }
                return this.remainingTokens.enhanced >= count
            default:
                return false
        }
    }

    /**
     * The default tokenizer is cl100k_base.
     */
    private static tokenizer = getEncoding('cl100k_base')

    /**
     * Encode the given text using the tokenizer.
     * The text is first normalized to NFKC to handle different character representations consistently.
     * All special tokens are included in the token count.
     */
    public static encode(text: string): number[] {
        return TokenCounter.tokenizer.encode(text.normalize('NFKC'), 'all')
    }

    public static decode(encoded: number[]): string {
        return TokenCounter.tokenizer.decode(encoded)
    }

    /**
     * Counts the number of tokens in the given text using the tokenizer.
     *
     * @param text - The input text to count tokens for.
     * @returns The number of tokens in the input text.
     */
    public static countTokens(text: string): number {
        return TokenCounter.encode(text).length
    }

    public static countPromptString(text: PromptString): number {
        return TokenCounter.encode(text.toString()).length
    }

    /**
     * Counts the number of tokens in the given message using the tokenizer.
     *
     * @param message - The message to count tokens for.
     * @returns The number of tokens in the message.
     */
    private static getTokenCountForMessage(message: Message): number {
        if (message?.text && message?.text.length > 0) {
            return TokenCounter.countPromptString(message.text)
        }
        return 0
    }

    /**
     * Calculates the total number of tokens across the given array of messages.
     *
     * @param messages - An array of messages to count the tokens for.
     * @returns The total number of tokens in the provided messages.
     */
    public static getMessagesTokenCount(messages: Message[]): number {
        return messages.reduce((acc, m) => acc + TokenCounter.getTokenCountForMessage(m), 0)
    }
}
