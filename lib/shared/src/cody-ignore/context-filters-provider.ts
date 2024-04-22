import { LRUCache } from 'lru-cache'
import { RE2 } from 're2-wasm'
import type * as vscode from 'vscode'
import { isFileURI } from '../common/uri'
import { logDebug, logError } from '../logger'
import { graphqlClient } from '../sourcegraph-api/graphql'
import type { CodyContextFilterItem } from '../sourcegraph-api/graphql/client'
import { wrapInActiveSpan } from '../tracing'

export const REFETCH_INTERVAL = 60 * 60 * 1000 // 1 hour

interface ParsedContextFilters {
    include: ParsedContextFilterItem[]
    exclude: ParsedContextFilterItem[]
}

interface ParsedContextFilterItem {
    repoNamePattern: RE2
    filePathPatterns?: RE2[]
}

export type GetRepoNameFromWorkspaceUri = (uri: vscode.Uri) => Promise<string | undefined>
type RepoName = string
type IsRepoNameIgnored = boolean

export class ContextFiltersProvider implements vscode.Disposable {
    /**
     * `null` value means that we failed to fetch context filters.
     * In that case, we should exclude all the URIs.
     */
    private contextFilters: ParsedContextFilters | null = null
    private cache = new LRUCache<RepoName, IsRepoNameIgnored>({ max: 128 })
    private getRepoNameFromWorkspaceUri: GetRepoNameFromWorkspaceUri | undefined = undefined
    private fetchIntervalId: NodeJS.Timeout | undefined | number

    async init(getRepoNameFromWorkspaceUri: GetRepoNameFromWorkspaceUri) {
        this.getRepoNameFromWorkspaceUri = getRepoNameFromWorkspaceUri
        this.dispose()
        await this.fetchContextFilters()
        this.startRefetchTimer()
    }

    private async fetchContextFilters(): Promise<void> {
        try {
            const response = await graphqlClient.contextFilters()
            this.cache.clear()
            this.contextFilters = null

            if (response) {
                logDebug('ContextFiltersProvider', 'fetchContextFilters', { verbose: response })
                this.contextFilters = {
                    include: (response.include || []).map(parseContextFilterItem),
                    exclude: (response.exclude || []).map(parseContextFilterItem),
                }
            }
        } catch (error) {
            if (error instanceof Error) {
                logError('ContextFiltersProvider', 'fetchContextFilters', error)
                return
            }
        }
    }

    private startRefetchTimer(): void {
        this.fetchIntervalId = setTimeout(() => {
            this.fetchContextFilters()
            this.startRefetchTimer()
        }, REFETCH_INTERVAL)
    }

    public isRepoNameIgnored(repoName: string): boolean {
        const cached = this.cache.get(repoName)
        if (cached !== undefined) {
            return cached
        }

        // If we don't have any context filters, we exclude everything.
        let isIgnored = this.contextFilters === null

        if (this.contextFilters?.include.length) {
            for (const parsedFilter of this.contextFilters.include) {
                isIgnored = !matchesContextFilter(parsedFilter, repoName)
                if (!isIgnored) {
                    break
                }
            }
        }

        if (!isIgnored && this.contextFilters?.exclude.length) {
            for (const parsedFilter of this.contextFilters.exclude) {
                if (matchesContextFilter(parsedFilter, repoName)) {
                    isIgnored = true
                    break
                }
            }
        }

        this.cache.set(repoName, isIgnored)
        return isIgnored
    }

    public async isUriIgnored(uri: vscode.Uri): Promise<boolean> {
        if (this.hasIncludeEverythingFilters()) {
            return false
        }

        if (this.hasExcludeEverythingFilters()) {
            return true
        }

        // TODO: process non-file URIs https://github.com/sourcegraph/cody/issues/3893
        if (!isFileURI(uri)) {
            logDebug('ContextFiltersProvider', 'isUriIgnored', `non-file URI ${uri.scheme}`)
            return true
        }

        const repoName = await wrapInActiveSpan('repoNameResolver.getRepoNameFromWorkspaceUri', () =>
            this.getRepoNameFromWorkspaceUri?.(uri)
        )

        return repoName ? this.isRepoNameIgnored(repoName) : true
    }

    public dispose(): void {
        this.cache.clear()

        if (this.fetchIntervalId) {
            clearTimeout(this.fetchIntervalId)
        }
    }

    private hasIncludeEverythingFilters() {
        return this.contextFilters?.include.length === 0 && this.contextFilters?.exclude.length === 0
    }

    private hasExcludeEverythingFilters() {
        return (
            this.contextFilters?.include.length === 0 &&
            this.contextFilters?.exclude.length === 1 &&
            this.contextFilters.exclude[0].repoNamePattern.toString() === '.*'
        )
    }
}

function matchesContextFilter(parsedFilter: ParsedContextFilterItem, repoName: string): boolean {
    return Boolean(parsedFilter.repoNamePattern.match(repoName))
}

function parseContextFilterItem(item: CodyContextFilterItem): ParsedContextFilterItem {
    const repoNamePattern = new RE2(item.repoNamePattern, 'u')
    const filePathPatterns = item.filePathPatterns
        ? item.filePathPatterns.map(pattern => new RE2(pattern, 'u'))
        : undefined

    return { repoNamePattern, filePathPatterns }
}

/**
 * A singleton instance of the `ContextFiltersProvider` class.
 * `contextFiltersProvider.init` should be called and awaited on extension activation.
 */
export const contextFiltersProvider = new ContextFiltersProvider()
