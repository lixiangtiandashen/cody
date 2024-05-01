import { ConsoleLogMessageSink, type LogSink } from './sinks'
export {
    LogSink,
    LogSinkInput,
    ConsoleLogMessageSink,
    SaveLogItemsSink,
} from './sinks'
import { IS_TEST, idGenerator } from '../util'
import type { LogItem } from './items'

const ALREADY_REGISTERED_ERROR = new Error(
    'The logger has already been registered. Make sure you only call `register()` once in your entrypoint'
)

const NOT_REGISTERED_ERROR = new Error(
    'Logger not initialized. Make sure to call `register()` in your entrypoint.'
)

class Logger {
    private _id?: string
    private _session?: string
    private _sinks: Set<LogSink> = new Set()
    public push(items: LogItem | LogItem[]): void {
        //TODO(rnauta): how to handle message serialized
        // const serialized = JSON.parse(JSON.stringify(items))
        //TODO(rnauta): always wrap in a trace?
        for (const sink of this.sinks) {
            sink.log?.(items)
        }
    }
    public register(
        id: string,
        defaultSinks: LogSink[] = [new ConsoleLogMessageSink()],
        session = idGenerator.next(),
        force = IS_TEST
    ) {
        if (this._id && !force) {
            throw ALREADY_REGISTERED_ERROR
        }
        this._id = id
        this._session = session
        this._sinks.clear()
        for (const sink of defaultSinks) {
            this._sinks.add(sink)
        }
    }

    public get id(): string {
        return this._id! // safe because checkRegistered
    }

    public get session(): string {
        return this._session! // safe because checkRegistered
    }

    public get sinks(): Set<LogSink> {
        return this._sinks
    }
}

class UninitializedLogger extends Logger {
    public register(
        id: string,
        defaultSinks?: LogSink[] | undefined,
        session?: string | undefined,
        _?: boolean
    ) {
        logger = new Logger()
        logger.register(id, defaultSinks, session, true)
    }

    public push(items: LogItem | LogItem[]): void {
        throw NOT_REGISTERED_ERROR
    }

    public get id(): string {
        throw NOT_REGISTERED_ERROR
    }

    public get session(): string {
        throw NOT_REGISTERED_ERROR
    }

    public get sinks(): Set<LogSink> {
        throw NOT_REGISTERED_ERROR
    }
}

export let logger: Logger = new UninitializedLogger()