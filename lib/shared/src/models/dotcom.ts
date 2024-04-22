import type { ModelProvider } from '.'
import {
    CHAT_INPUT_TOKEN_BUDGET,
    CHAT_OUTPUT_TOKEN_BUDGET,
    EXPERIMENTAL_CHAT_INPUT_TOKEN_BUDGET,
    EXPERIMENTAL_USER_CONTEXT_TOKEN_BUDGET,
} from '../token/constants'

import { ModelUsage } from './types'

// The models must first be added to the custom chat models list in https://sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/completions/httpapi/chat.go?L48-51
const DEFAULT_DOT_COM_MODELS: ModelProvider[] = [
    // The order listed here is the order shown to users. Put the default LLM first.
    {
        title: 'Claude 3 Sonnet',
        model: 'anthropic/claude-3-sonnet-20240229',
        provider: 'Anthropic',
        default: true,
        codyProOnly: false,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
    },
    {
        title: 'Claude 2.0',
        model: 'anthropic/claude-2.0',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
    },
    {
        title: 'Claude 2.1',
        model: 'anthropic/claude-2.1',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
    },
    {
        title: 'Claude Instant',
        model: 'anthropic/claude-instant-1.2',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
    },
    {
        title: 'Claude 3 Haiku',
        model: 'anthropic/claude-3-haiku-20240307',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
    },
    {
        title: 'Claude 3 Opus',
        model: 'anthropic/claude-3-opus-20240229',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
    },
    {
        title: 'GPT-3.5 Turbo',
        model: 'openai/gpt-3.5-turbo',
        provider: 'OpenAI',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
    },
    {
        title: 'GPT-4 Turbo',
        model: 'openai/gpt-4-turbo',
        provider: 'OpenAI',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
    },
    // TODO (tom) Improve prompt for Mixtral + Edit to see if we can use it there too.
    {
        title: 'Mixtral 8x7B',
        model: 'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct',
        provider: 'Mistral',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
    },
    {
        title: 'Mixtral 8x22B',
        model: 'fireworks/accounts/fireworks/models/mixtral-8x22b-instruct',
        provider: 'Mistral',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
    },
]

/**
 * NOTE: DotCom users with FeatureFlag.CodyChatContextBudget for A/B testing only.
 *
 * An array of model IDs that are used for the FeatureFlag.CodyChatContextBudget A/B testing.
 * Users with the feature flag enabled will have a seperated token limit for user-context.
 *
 * For other models, the context window remains the same and is shared between input and context.
 */
const modelsWithHigherLimit = ['anthropic/claude-3-sonnet-20240229', 'anthropic/claude-3-opus-20240229']

/**
 * Returns an array of ModelProviders representing the default models for DotCom.
 *
 * NOTE: 'experimental' is only for DotCom users with FeatureFlag.CodyChatContextBudget enabled
 *
 * @param modelType - Specifies whether to return the default or experimental models.
 * @returns An array of `ModelProvider` objects.
 */
export function getDotComDefaultModels(modelType: 'default' | 'experimental'): ModelProvider[] {
    return modelType === 'default'
        ? DEFAULT_DOT_COM_MODELS
        : // NOTE: Required FeatureFlag.CodyChatContextBudget for A/B testing.
          DEFAULT_DOT_COM_MODELS.map(m =>
              modelsWithHigherLimit.includes(m.model)
                  ? {
                          ...m,
                          contextWindow: {
                              input: EXPERIMENTAL_CHAT_INPUT_TOKEN_BUDGET,
                              context: { user: EXPERIMENTAL_USER_CONTEXT_TOKEN_BUDGET },
                              output: CHAT_OUTPUT_TOKEN_BUDGET,
                          },
                      }
                  : m
          )
}
