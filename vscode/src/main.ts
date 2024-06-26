import * as vscode from 'vscode'

import {
    type AuthStatus,
    ConfigFeaturesSingleton,
    type ConfigurationWithAccessToken,
    type DefaultCodyCommands,
    type EventSource,
    ModelsService,
    PromptMixin,
    PromptString,
    contextFiltersProvider,
    featureFlagProvider,
    githubClient,
    graphqlClient,
    newPromptMixin,
    setClientNameVersion,
    setLogger,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import type { CommandResult } from './CommandResult'
import { ContextProvider } from './chat/ContextProvider'
import type { MessageProviderOptions } from './chat/MessageProvider'
import { ChatManager, CodyChatPanelViewType } from './chat/chat-view/ChatManager'
import {
    ACCOUNT_LIMITS_INFO_URL,
    ACCOUNT_UPGRADE_URL,
    CODY_FEEDBACK_URL,
    CODY_OLLAMA_DOCS_URL,
} from './chat/protocol'
import { CodeActionProvider } from './code-actions/CodeActionProvider'
import { executeCodyCommand, setCommandController } from './commands/CommandsController'
import { GhostHintDecorator } from './commands/GhostHintDecorator'
import {
    executeDocCommand,
    executeExplainCommand,
    executeExplainOutput,
    executeSmellCommand,
    executeTestCaseEditCommand,
    executeTestChatCommand,
    executeTestEditCommand,
} from './commands/execute'
import { executeExplainHistoryCommand } from './commands/execute/explain-history'
import { CodySourceControl } from './commands/scm/source-control'
import type { CodyCommandArgs } from './commands/types'
import { newCodyCommandArgs } from './commands/utils/get-commands'
import { createInlineCompletionItemProvider } from './completions/create-inline-completion-item-provider'
import { createInlineCompletionItemFromMultipleProviders } from './completions/create-multi-model-inline-completion-provider'
import { getConfiguration, getFullConfig } from './configuration'
import { EnterpriseContextFactory } from './context/enterprise-context-factory'
import { exposeOpenCtxClient } from './context/openctx'
import { EditManager } from './edit/manager'
import { manageDisplayPathEnvInfoForExtension } from './editor/displayPathEnvInfo'
import { VSCodeEditor } from './editor/vscode-editor'
import type { PlatformContext } from './extension.common'
import { configureExternalServices } from './external-services'
import { isRunningInsideAgent } from './jsonrpc/isRunningInsideAgent'
import { logDebug, logError } from './log'
import { MinionOrchestrator } from './minion/MinionOrchestrator'
import { PoorMansBash } from './minion/environment'
import { getChatModelsFromConfiguration, syncModels } from './models/sync'
import { CodyProExpirationNotifications } from './notifications/cody-pro-expiration'
import { showSetupNotification } from './notifications/setup-notification'
import { initVSCodeGitApi } from './repository/git-extension-api'
import { repoNameResolver } from './repository/repo-name-resolver'
import { SearchViewProvider } from './search/SearchViewProvider'
import { AuthProvider } from './services/AuthProvider'
import { CharactersLogger } from './services/CharactersLogger'
import { showFeedbackSupportQuickPick } from './services/FeedbackOptions'
import { GuardrailsProvider } from './services/GuardrailsProvider'
import { displayHistoryQuickPick } from './services/HistoryChat'
import { localStorage } from './services/LocalStorageProvider'
import { VSCodeSecretStorage, getAccessToken, secretStorage } from './services/SecretStorageProvider'
import { registerSidebarCommands } from './services/SidebarCommands'
import { createStatusBar } from './services/StatusBar'
import { upstreamHealthProvider } from './services/UpstreamHealthProvider'
import { setUpCodyIgnore } from './services/cody-ignore'
import { createOrUpdateEventLogger, telemetryService } from './services/telemetry'
import { createOrUpdateTelemetryRecorderProvider } from './services/telemetry-v2'
import { onTextDocumentChange } from './services/utils/codeblock-action-tracker'
import {
    enableVerboseDebugMode,
    exportOutputLog,
    openCodyOutputChannel,
} from './services/utils/export-logs'
import { openCodyIssueReporter } from './services/utils/issue-reporter'
import { SupercompletionProvider } from './supercompletions/supercompletion-provider'
import { parseAllVisibleDocuments, updateParseTreeOnEdit } from './tree-sitter/parse-tree-cache'
import { version } from './version'

/**
 * Start the extension, watching all relevant configuration and secrets for changes.
 */
export async function start(
    context: vscode.ExtensionContext,
    platform: PlatformContext
): Promise<vscode.Disposable> {
    // Set internal storage fields for storage provider singletons
    localStorage.setStorage(context.globalState)
    if (secretStorage instanceof VSCodeSecretStorage) {
        secretStorage.setStorage(context.secrets)
    }

    setLogger({ logDebug, logError })

    const disposables: vscode.Disposable[] = []

    const { disposable, onConfigurationChange } = await register(
        context,
        await getFullConfig(),
        platform
    )
    disposables.push(disposable)

    // Re-initialize when configuration
    disposables.push(
        vscode.workspace.onDidChangeConfiguration(async event => {
            if (event.affectsConfiguration('cody')) {
                const config = await getFullConfig()
                await onConfigurationChange(config)
                platform.onConfigurationChange?.(config)
                if (config.chatPreInstruction.length > 0) {
                    PromptMixin.addCustom(newPromptMixin(config.chatPreInstruction))
                }
                getChatModelsFromConfiguration()
            }
        })
    )

    return vscode.Disposable.from(...disposables)
}

// Registers commands and webview given the config.
const register = async (
    context: vscode.ExtensionContext,
    initialConfig: ConfigurationWithAccessToken,
    platform: PlatformContext
): Promise<{
    disposable: vscode.Disposable
    onConfigurationChange: (newConfig: ConfigurationWithAccessToken) => Promise<void>
}> => {
    setClientNameVersion(platform.extensionClient.clientName, platform.extensionClient.clientVersion)
    const authProvider = AuthProvider.create(initialConfig)
    await localStorage.setConfig(initialConfig)

    const disposables: vscode.Disposable[] = []
    // Initialize `displayPath` first because it might be used to display paths in error messages
    // from the subsequent initialization.
    disposables.push(manageDisplayPathEnvInfoForExtension())

    disposables.push(await initVSCodeGitApi())

    const isExtensionModeDevOrTest =
        context.extensionMode === vscode.ExtensionMode.Development ||
        context.extensionMode === vscode.ExtensionMode.Test

    await configureEventsInfra(initialConfig, isExtensionModeDevOrTest, authProvider)

    const editor = new VSCodeEditor()

    // Could we use the `initialConfig` instead?
    const workspaceConfig = vscode.workspace.getConfiguration()
    const config = getConfiguration(workspaceConfig)

    if (config.chatPreInstruction.length > 0) {
        PromptMixin.addCustom(newPromptMixin(config.chatPreInstruction))
    }

    void parseAllVisibleDocuments()

    disposables.push(vscode.window.onDidChangeVisibleTextEditors(parseAllVisibleDocuments))
    disposables.push(vscode.workspace.onDidChangeTextDocument(updateParseTreeOnEdit))

    // Enable tracking for pasting chat responses into editor text
    disposables.push(
        vscode.workspace.onDidChangeTextDocument(async e => {
            const changedText = e.contentChanges[0]?.text
            // Skip if the document is not a file or if the copied text is from insert
            if (!changedText || e.document.uri.scheme !== 'file') {
                return
            }
            await onTextDocumentChange(changedText)
        })
    )

    await authProvider.init()

    exposeOpenCtxClient(context.secrets, initialConfig)
    graphqlClient.onConfigurationChange(initialConfig)
    githubClient.onConfigurationChange({ authToken: initialConfig.experimentalGithubAccessToken })
    void featureFlagProvider.syncAuthStatus()

    const {
        chatClient,
        completionsClient,
        codeCompletionsClient,
        guardrails,
        localEmbeddings,
        contextRanking,
        onConfigurationChange: externalServicesOnDidConfigurationChange,
        symfRunner,
    } = await configureExternalServices(context, initialConfig, platform, authProvider)

    if (symfRunner) {
        disposables.push(symfRunner)
    }

    //
    // Minion stuff
    //
    if (config.experimentalMinionAnthropicKey) {
        const minionOrchestrator = new MinionOrchestrator(context.extensionUri, authProvider, symfRunner)
        disposables.push(minionOrchestrator)
        disposables.push(
            // Minion
            vscode.commands.registerCommand('cody.minion.panel.new', () =>
                minionOrchestrator.createNewMinionPanel()
            ),
            vscode.commands.registerCommand('cody.minion.new-terminal', async () => {
                const t = new PoorMansBash()
                await t.run('hello world')
            })
        )
    }

    const enterpriseContextFactory = new EnterpriseContextFactory(completionsClient)
    disposables.push(enterpriseContextFactory)

    const contextProvider = new ContextProvider(
        initialConfig,
        editor,
        authProvider,
        localEmbeddings,
        enterpriseContextFactory.createRemoteSearch()
    )
    disposables.push(contextFiltersProvider)
    disposables.push(contextProvider)
    await contextFiltersProvider
        .init(repoNameResolver.getRepoNamesFromWorkspaceUri)
        .then(() => contextProvider.init())

    // Shared configuration that is required for chat views to send and receive messages
    const messageProviderOptions: MessageProviderOptions = {
        chat: chatClient,
        guardrails,
        editor,
        authProvider,
        contextProvider,
    }

    const chatManager = new ChatManager(
        {
            ...messageProviderOptions,
            extensionUri: context.extensionUri,
            config,
            startTokenReceiver: platform.startTokenReceiver,
        },
        chatClient,
        enterpriseContextFactory,
        localEmbeddings || null,
        contextRanking || null,
        symfRunner || null,
        guardrails
    )

    const ghostHintDecorator = new GhostHintDecorator(authProvider)
    const editorManager = new EditManager({
        chat: chatClient,
        editor,
        ghostHintDecorator,
        authProvider,
        extensionClient: platform.extensionClient,
    })
    disposables.push(ghostHintDecorator, editorManager, new CodeActionProvider({ contextProvider }))

    let oldConfig = JSON.stringify(initialConfig)
    async function onConfigurationChange(newConfig: ConfigurationWithAccessToken): Promise<void> {
        if (oldConfig === JSON.stringify(newConfig)) {
            return Promise.resolve()
        }

        ModelsService.onConfigChange(newConfig.experimentalOllamaChat)

        const promises: Promise<void>[] = []
        oldConfig = JSON.stringify(newConfig)

        promises.push(featureFlagProvider.syncAuthStatus())
        graphqlClient.onConfigurationChange(newConfig)
        exposeOpenCtxClient(secretStorage, newConfig)
        upstreamHealthProvider.onConfigurationChange(newConfig)
        githubClient.onConfigurationChange({ authToken: initialConfig.experimentalGithubAccessToken })
        promises.push(
            contextFiltersProvider
                .init(repoNameResolver.getRepoNamesFromWorkspaceUri)
                .then(() => contextProvider.onConfigurationChange(newConfig))
        )
        externalServicesOnDidConfigurationChange(newConfig)
        promises.push(configureEventsInfra(newConfig, isExtensionModeDevOrTest, authProvider))
        platform.onConfigurationChange?.(newConfig)
        symfRunner?.setSourcegraphAuth(newConfig.serverEndpoint, newConfig.accessToken)
        enterpriseContextFactory.clientConfigurationDidChange()
        promises.push(
            localEmbeddings?.setAccessToken(newConfig.serverEndpoint, newConfig.accessToken) ??
                Promise.resolve()
        )
        promises.push(setupAutocomplete())
        promises.push(localStorage.setConfig(newConfig))
        await Promise.all(promises)
    }

    // Register tree views
    disposables.push(
        chatManager,
        vscode.window.registerWebviewViewProvider('cody.chat', chatManager.sidebarViewController, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        // Update external services when configurationChangeEvent is fired by chatProvider
        contextProvider.configurationChangeEvent.event(async () => {
            const newConfig = await getFullConfig()
            await onConfigurationChange(newConfig)
        })
    )

    const statusBar = createStatusBar()
    const sourceControl = new CodySourceControl(chatClient)

    // Important to respect `config.experimentalSymfContext`. The agent
    // currently crashes with a cryptic error when running with symf enabled so
    // we need a way to reliably disable symf until we fix the root problem.
    if (symfRunner && config.experimentalSymfContext) {
        const searchViewProvider = new SearchViewProvider(symfRunner)
        disposables.push(searchViewProvider)
        searchViewProvider.initialize()
    }

    if (localEmbeddings) {
        // kick-off embeddings initialization
        localEmbeddings.start()
    }

    if (config.experimentalSupercompletions) {
        disposables.push(new SupercompletionProvider({ statusBar, chat: chatClient }))
    }

    // Adds a change listener to the auth provider that syncs the auth status
    authProvider.addChangeListener(async (authStatus: AuthStatus) => {
        syncModels(authStatus)
        // Chat Manager uses Simple Context Provider
        await chatManager.syncAuthStatus(authStatus)
        editorManager.syncAuthStatus(authStatus)
        // Update context provider first it will also update the configuration
        await contextProvider.syncAuthStatus()
        const parallelPromises: Promise<void>[] = []
        parallelPromises.push(featureFlagProvider.syncAuthStatus())
        // feature flag provider
        // Symf
        if (symfRunner && authStatus.isLoggedIn) {
            parallelPromises.push(
                getAccessToken()
                    .then(token => symfRunner.setSourcegraphAuth(authStatus.endpoint, token))
                    .catch(() => {})
            )
        } else {
            symfRunner?.setSourcegraphAuth(null, null)
        }
        parallelPromises.push(setupAutocomplete())
        await Promise.all(parallelPromises)
        statusBar.syncAuthStatus(authStatus)
        sourceControl.syncAuthStatus(authStatus)
    })

    // Sync initial auth status
    const initAuthStatus = authProvider.getAuthStatus()
    syncModels(initAuthStatus)
    await chatManager.syncAuthStatus(initAuthStatus)
    editorManager.syncAuthStatus(initAuthStatus)
    ModelsService.onConfigChange(initialConfig.experimentalOllamaChat)
    statusBar.syncAuthStatus(initAuthStatus)
    sourceControl.syncAuthStatus(initAuthStatus)

    const commandsManager = platform.createCommandsProvider?.()
    setCommandController(commandsManager)
    repoNameResolver.init(authProvider)

    // Execute Cody Commands and Cody Custom Commands
    const executeCommand = (
        commandKey: DefaultCodyCommands | string,
        args?: Partial<CodyCommandArgs>
    ): Promise<CommandResult | undefined> => {
        return executeCommandUnsafe(PromptString.unsafe_fromUserQuery(commandKey), args).catch(error => {
            if (error instanceof Error) {
                console.log(error.stack)
            }
            logError('executeCommand', commandKey, args, error)
            return undefined
        })
    }

    const executeCommandUnsafe = async (
        id: DefaultCodyCommands | PromptString,
        args?: Partial<CodyCommandArgs>
    ): Promise<CommandResult | undefined> => {
        const { commands } = await ConfigFeaturesSingleton.getInstance().getConfigFeatures()
        if (!commands) {
            void vscode.window.showErrorMessage(
                'This feature has been disabled by your Sourcegraph site admin.'
            )
            return undefined
        }

        // Process command with the commands controller
        return await executeCodyCommand(id, newCodyCommandArgs(args))
    }
    // Register Cody Commands
    disposables.push(
        vscode.commands.registerCommand('cody.action.command', (id, a) => executeCommand(id, a)),
        vscode.commands.registerCommand('cody.command.explain-code', a => executeExplainCommand(a)),
        vscode.commands.registerCommand('cody.command.smell-code', a => executeSmellCommand(a)),
        vscode.commands.registerCommand('cody.command.document-code', a => executeDocCommand(a)),
        vscode.commands.registerCommand('cody.command.generate-tests', a => executeTestChatCommand(a)),
        vscode.commands.registerCommand('cody.command.unit-tests', a => executeTestEditCommand(a)),
        vscode.commands.registerCommand('cody.command.tests-cases', a => executeTestCaseEditCommand(a)),
        vscode.commands.registerCommand('cody.command.explain-output', a => executeExplainOutput(a)),
        sourceControl // Generate Commit Message command
    )

    // Internal-only test commands
    if (isExtensionModeDevOrTest) {
        await vscode.commands.executeCommand('setContext', 'cody.devOrTest', true)
        disposables.push(
            vscode.commands.registerCommand('cody.test.set-context-filters', async () => {
                // Prompt the user for the policy
                const raw = await vscode.window.showInputBox({ title: 'Context Filters Overwrite' })
                if (!raw) {
                    return
                }
                try {
                    const policy = JSON.parse(raw)
                    contextFiltersProvider.setTestingContextFilters(policy)
                } catch (error) {
                    vscode.window.showErrorMessage(
                        'Failed to parse context filters policy. Please check your JSON syntax.'
                    )
                }
            })
        )
    }

    if (commandsManager !== undefined) {
        disposables.push(
            vscode.commands.registerCommand('cody.command.explain-history', a =>
                executeExplainHistoryCommand(commandsManager, a)
            )
        )
    }

    disposables.push(
        // Tests
        // Access token - this is only used in configuration tests
        vscode.commands.registerCommand('cody.test.token', async (endpoint, token) =>
            authProvider.auth({ endpoint, token })
        ),

        // Auth
        vscode.commands.registerCommand('cody.auth.signin', () => authProvider.signinMenu()),
        vscode.commands.registerCommand('cody.auth.signout', () => authProvider.signoutMenu()),
        vscode.commands.registerCommand('cody.auth.account', () => authProvider.accountMenu()),
        vscode.commands.registerCommand('cody.auth.support', () => showFeedbackSupportQuickPick()),
        vscode.commands.registerCommand('cody.auth.status', () => authProvider.getAuthStatus()), // Used by the agent
        vscode.commands.registerCommand(
            'cody.agent.auth.authenticate',
            async ({ serverEndpoint, accessToken, customHeaders }) => {
                if (typeof serverEndpoint !== 'string') {
                    throw new TypeError('serverEndpoint is required')
                }
                if (typeof accessToken !== 'string') {
                    throw new TypeError('accessToken is required')
                }
                return (
                    await authProvider.auth({
                        endpoint: serverEndpoint,
                        token: accessToken,
                        customHeaders,
                    })
                ).authStatus
            }
        ),
        // Chat
        vscode.commands.registerCommand('cody.focus', () =>
            vscode.commands.executeCommand('cody.chat.focus')
        ),
        vscode.commands.registerCommand('cody.settings.extension', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', {
                query: '@ext:sourcegraph.cody-ai',
            })
        ),
        vscode.commands.registerCommand('cody.chat.view.popOut', async () => {
            vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow')
        }),
        vscode.commands.registerCommand('cody.chat.history.panel', async () => {
            await displayHistoryQuickPick(authProvider.getAuthStatus())
        }),
        vscode.commands.registerCommand('cody.settings.extension.chat', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', {
                query: '@ext:sourcegraph.cody-ai chat',
            })
        ),
        vscode.commands.registerCommand('cody.copy.version', () =>
            vscode.env.clipboard.writeText(version)
        ),

        // Account links
        ...registerSidebarCommands(),

        // Account links
        vscode.commands.registerCommand(
            'cody.show-rate-limit-modal',
            async (userMessage: string, retryMessage: string, upgradeAvailable: boolean) => {
                if (upgradeAvailable) {
                    const option = await vscode.window.showInformationMessage(
                        'Upgrade to Cody Pro',
                        {
                            modal: true,
                            detail: `${userMessage}\n\nUpgrade to Cody Pro for unlimited autocomplete suggestions, chat messages and commands.\n\n${retryMessage}`,
                        },
                        'Upgrade',
                        'See Plans'
                    )
                    // Both options go to the same URL
                    if (option) {
                        void vscode.env.openExternal(vscode.Uri.parse(ACCOUNT_UPGRADE_URL.toString()))
                    }
                } else {
                    const option = await vscode.window.showInformationMessage(
                        'Rate Limit Exceeded',
                        {
                            modal: true,
                            detail: `${userMessage}\n\n${retryMessage}`,
                        },
                        'Learn More'
                    )
                    if (option) {
                        void vscode.env.openExternal(
                            vscode.Uri.parse(ACCOUNT_LIMITS_INFO_URL.toString())
                        )
                    }
                }
            }
        ),

        // Register URI Handler (e.g. vscode://sourcegraph.cody-ai)
        vscode.window.registerUriHandler({
            handleUri: async (uri: vscode.Uri) => {
                if (uri.path === '/app-done') {
                    // This is an old re-entrypoint from App that is a no-op now.
                } else {
                    await authProvider.tokenCallbackHandler(uri, config.customHeaders)
                }
            },
        }),
        statusBar,
        // Walkthrough / Support
        vscode.commands.registerCommand('cody.feedback', () =>
            vscode.env.openExternal(vscode.Uri.parse(CODY_FEEDBACK_URL.href))
        ),
        vscode.commands.registerCommand('cody.welcome', async () => {
            telemetryService.log(
                'CodyVSCodeExtension:walkthrough:clicked',
                { page: 'welcome' },
                { hasV2Event: true }
            )
            telemetryRecorder.recordEvent('cody.walkthrough', 'clicked')
            // Hack: We have to run this twice to force VS Code to register the walkthrough
            // Open issue: https://github.com/microsoft/vscode/issues/186165
            await vscode.commands.executeCommand('workbench.action.openWalkthrough')
            return vscode.commands.executeCommand(
                'workbench.action.openWalkthrough',
                'sourcegraph.cody-ai#welcome',
                false
            )
        }),
        vscode.commands.registerCommand('cody.welcome-mock', () =>
            vscode.commands.executeCommand(
                'workbench.action.openWalkthrough',
                'sourcegraph.cody-ai#welcome',
                false
            )
        ),
        vscode.commands.registerCommand('cody.walkthrough.showLogin', () =>
            vscode.commands.executeCommand('workbench.view.extension.cody')
        ),
        vscode.commands.registerCommand('cody.walkthrough.showChat', () =>
            chatManager.setWebviewView('chat')
        ),
        vscode.commands.registerCommand('cody.walkthrough.showFixup', () =>
            chatManager.setWebviewView('chat')
        ),
        vscode.commands.registerCommand('cody.walkthrough.showExplain', async () => {
            telemetryService.log(
                'CodyVSCodeExtension:walkthrough:clicked',
                { page: 'showExplain' },
                { hasV2Event: true }
            )
            telemetryRecorder.recordEvent('cody.walkthrough.showExplain', 'clicked')
            await chatManager.setWebviewView('chat')
        }),

        // StatusBar Commands
        vscode.commands.registerCommand('cody.statusBar.ollamaDocs', () => {
            vscode.commands.executeCommand('vscode.open', CODY_OLLAMA_DOCS_URL.href)
            telemetryRecorder.recordEvent('cody.statusBar.ollamaDocs', 'opened')
        }),

        // Check if user has just moved back from a browser window to upgrade cody pro
        vscode.window.onDidChangeWindowState(async ws => {
            const authStatus = authProvider.getAuthStatus()
            if (ws.focused && authStatus.isDotCom && authStatus.isLoggedIn) {
                const res = await graphqlClient.getCurrentUserCodyProEnabled()
                if (res instanceof Error) {
                    console.error(res)
                    return
                }
                // Re-auth if user's cody pro status has changed
                const isCurrentCodyProUser = !authStatus.userCanUpgrade
                if (res.codyProEnabled !== isCurrentCodyProUser) {
                    authProvider.reloadAuthStatus()
                }
            }
        }),
        new CodyProExpirationNotifications(
            graphqlClient,
            authProvider,
            featureFlagProvider,
            vscode.window.showInformationMessage,
            vscode.env.openExternal
        ),
        // For register sidebar clicks
        vscode.commands.registerCommand('cody.sidebar.click', (name: string, command: string) => {
            const source: EventSource = 'sidebar'
            telemetryService.log(`CodyVSCodeExtension:command:${name}:clicked`, {
                source,
            })
            telemetryRecorder.recordEvent(`cody.command.${name}`, 'clicked', {
                privateMetadata: { source },
            })
            void vscode.commands.executeCommand(command, [source])
        }),
        ...setUpCodyIgnore(initialConfig),
        // For debugging
        vscode.commands.registerCommand('cody.debug.export.logs', () => exportOutputLog(context.logUri)),
        vscode.commands.registerCommand('cody.debug.outputChannel', () => openCodyOutputChannel()),
        vscode.commands.registerCommand('cody.debug.enable.all', () => enableVerboseDebugMode()),
        vscode.commands.registerCommand('cody.debug.reportIssue', () => openCodyIssueReporter()),
        new CharactersLogger(),
        upstreamHealthProvider.onConfigurationChange(initialConfig)
    )

    let setupAutocompleteQueue = Promise.resolve() // Create a promise chain to avoid parallel execution

    let autocompleteDisposables: vscode.Disposable[] = []
    function disposeAutocomplete(): void {
        if (autocompleteDisposables) {
            for (const d of autocompleteDisposables) {
                d.dispose()
            }
            autocompleteDisposables = []
        }
    }
    disposables.push({
        dispose: disposeAutocomplete,
    })

    function setupAutocomplete(): Promise<void> {
        setupAutocompleteQueue = setupAutocompleteQueue
            .then(async () => {
                const config = await getFullConfig()
                if (!config.autocomplete) {
                    disposeAutocomplete()
                    if (
                        config.isRunningInsideAgent &&
                        !process.env.CODY_SUPPRESS_AGENT_AUTOCOMPLETE_WARNING
                    ) {
                        throw new Error(
                            'The setting `config.autocomplete` evaluated to `false`. It must be true when running inside the agent. ' +
                                'To fix this problem, make sure that the setting cody.autocomplete.enabled has the value true.'
                        )
                    }
                    return
                }

                // If completions are already initialized and still enabled, we need to reset the
                // completion provider.
                disposeAutocomplete()

                const autocompleteFeatureFlagChangeSubscriber = featureFlagProvider.onFeatureFlagChanged(
                    'cody-autocomplete',
                    setupAutocomplete
                )
                autocompleteDisposables.push({
                    dispose: autocompleteFeatureFlagChangeSubscriber,
                })
                autocompleteDisposables.push(
                    await createInlineCompletionItemProvider({
                        config,
                        client: codeCompletionsClient,
                        statusBar,
                        authProvider,
                        triggerNotice: notice => {
                            void chatManager.triggerNotice(notice)
                        },
                        createBfgRetriever: platform.createBfgRetriever,
                    })
                )
                autocompleteDisposables.push(
                    await createInlineCompletionItemFromMultipleProviders({
                        config,
                        client: codeCompletionsClient,
                        statusBar,
                        authProvider,
                        triggerNotice: notice => {
                            void chatManager.triggerNotice(notice)
                        },
                        createBfgRetriever: platform.createBfgRetriever,
                    })
                )
            })
            .catch(error => {
                console.error('Error creating inline completion item provider:', error)
            })
        return setupAutocompleteQueue
    }

    const autocompleteSetup = setupAutocomplete().catch(() => {})

    if (initialConfig.experimentalGuardrails) {
        const guardrailsProvider = new GuardrailsProvider(guardrails, editor)
        disposables.push(
            vscode.commands.registerCommand('cody.guardrails.debug', async () => {
                await guardrailsProvider.debugEditorSelection()
            })
        )
    }

    if (!isRunningInsideAgent()) {
        // TODO: The interactive tutorial is currently VS Code specific, both in terms of features and keyboard shortcuts.
        // Consider opening this up to support dynamic content via Cody Agent.
        // This would allow us the present the same tutorial but with client-specific steps.
        // Alternatively, clients may not wish to use this tutorial and instead opt for something more suitable for their environment.
        const { registerInteractiveTutorial } = await import('./tutorial')
        registerInteractiveTutorial(context).then(disposable => disposables.push(...disposable))
    }

    // INC-267 do NOT await on this promise. This promise triggers
    // `vscode.window.showInformationMessage()`, which only resolves after the
    // user has clicked on "Setup". Awaiting on this promise will make the Cody
    // extension timeout during activation.
    void showSetupNotification(initialConfig)

    // Register a serializer for reviving the chat panel on reload
    if (vscode.window.registerWebviewPanelSerializer) {
        vscode.window.registerWebviewPanelSerializer(CodyChatPanelViewType, {
            async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, chatID: string) {
                if (chatID && webviewPanel.title) {
                    logDebug('main:deserializeWebviewPanel', 'reviving last unclosed chat panel')
                    await chatManager.revive(webviewPanel, chatID)
                }
            },
        })
    }

    const [_, extensionClientDispose] = await Promise.all([
        autocompleteSetup,
        platform.extensionClient.provide({ enterpriseContextFactory }),
    ])
    disposables.push(extensionClientDispose)

    return {
        disposable: vscode.Disposable.from(...disposables),
        onConfigurationChange,
    }
}

/**
 * Create or update events infrastructure, both legacy (telemetryService) and
 * new (telemetryRecorder)
 */
async function configureEventsInfra(
    config: ConfigurationWithAccessToken,
    isExtensionModeDevOrTest: boolean,
    authProvider: AuthProvider
): Promise<void> {
    await createOrUpdateEventLogger(config, isExtensionModeDevOrTest, authProvider)
    await createOrUpdateTelemetryRecorderProvider(config, isExtensionModeDevOrTest, authProvider)
}
