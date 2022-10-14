import OBSWebSocket, { OBSWebSocketError, EventSubscription } from 'obs-websocket-js'
import { logger } from '.'
import { getTwitchHlsStream } from './twitch'
import { Lock } from "async-await-mutex-lock"

export class ObsWSClient extends OBSWebSocket {
    private address: string
    private challenge: string
    private prefix: string
    private connectionPending: Lock<string>
    private waitForReconnect: number

    constructor(host: string, port: Number, challenge: string = '', prefix: string = '!obs', waitForReconnect: number = 3000) {
        super()
        this.address = `ws://${host}:${port}`
        this.challenge = challenge
        this.prefix = prefix
        this.connectionPending = new Lock()
        this.waitForReconnect = waitForReconnect

        this.addListener('ConnectionOpened', this.handleOnOpen)
        this.addListener('ExitStarted', this.handleExitStarted)
        this.safeConnect()
            .then((isConnnected: boolean) => {
                if(!isConnnected) {
                    this.attemptReconnect()
                }
            })
    }

    private async msleep(timeMS: number) {
        await Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, timeMS);
    }

    private async safeConnect() : Promise<boolean> {
        var isConnected
        await this.connectionPending.acquire()
        const acquired = this.connectionPending.isAcquired()

        if(!acquired) {
            logger.error('Connection attempt already started! Exiting this event!')
            return null
        }

        try {
            logger.info(`Attempting to connect to ${this.address}...`)
            const res = await this.connect(this.address, this.challenge, { eventSubscriptions: EventSubscription.All, rpcVersion: 1 })
            logger.info(`Established connection to OBS with RPC version: ${res.rpcVersion} and WS Version: ${res.obsWebSocketVersion}!`)
            isConnected = true
        } catch(error) {
            logger.error(`Failed to connect to websocket: ${error}`)
            isConnected = false
        } finally {
            this.connectionPending.release()
            return isConnected
        }
    }

    private async handleOnOpen() {}

    private async attemptReconnect() {
        while(true) {
            logger.warn(`Failed to reach websocket! Waiting for ${this.waitForReconnect}s before trying again...`)
            await this.msleep(this.waitForReconnect).catch(e => logger.error)
            if(await this.safeConnect().catch(e => logger.error)) {
                break
            }
        }
    }

    private async handleExitStarted() {
        this.disconnect()
        logger.warn(`Session at ${this.address} gracefully closed!`)
        this.attemptReconnect()
    }

    private handleSetStreamCommand(instance: ObsWSClient, username: string, args) {
        if (args.length < 3 || args.length > 4) {
            logger.warn(`[MALFORMED ARGS][${username}]: ${args}`)
            return
        }

        const index = Number.parseInt(args[2])
        if(args.length == 3) {
            const nullStream = ''
            logger.info(`Setting stream_${index} to ${nullStream}`)
            instance.setStream(index, nullStream)
                .then(res => logger.info)
                .catch(e => logger.error)
        } else {
            const channel = args[3].toLowerCase()
            getTwitchHlsStream(channel)
                .then((url: string) => {
                    logger.info(`Setting stream_${index} to https://twitch.tv/${channel}`)
                    instance.setStream(index, url)
                        .then(res => logger.info)
                        .catch(e => logger.error)
                })
                .catch(e => logger.error)
        }
    }

    private handleSetVolumeCommand(instance: ObsWSClient, username: string, args) {
        if (args.length < 3 || args.length > 4) {
            logger.warn(`[MALFORMED ARGS][${username}]: ${args}`)
            return
        }

        const index = Number.parseInt(args[2])
        const level = Number.parseFloat(args[3])

        instance.setVolume(index, level)
            .then(res => logger.info)
            .catch(e => logger.error)
    }

    public handleTwitchMessage(instance, channel, tags, message, self) : void {
        const username = tags.username
        const isAuthorized = tags.mod || (tags.badges != null && ('vip' in tags.badges || 'broadcaster' in tags.badges))
        const args = message.split(' ')

        if(args[0] != instance.prefix) {
            return
        } else if(!isAuthorized) {
            logger.warn(`[UNAUTHORIZED][${username}]: ${message}`)
            return
        } else if(args.length < 2) {
            logger.warn(`[MALFORMED][${username}]: ${message}`)
            return
        }

        logger.info(`[${username}]: ${message}`)
        const command = args[1]
        switch(command) {
            case 'stream': {
                instance.handleSetStreamCommand(instance, username, args)
                break
            }
            case 'volume': {
                instance.handleSetVolumeCommand(instance, username, args)
                break
            }
            default: {
                logger.warn(`Unrecognize command from ${username}: \`${command}\`!`)
            }
        }
    }

    private async setStream(streamIndex: number, url: string) {
        const inputName = `stream_${streamIndex}`
        logger.info(`Setting ${inputName} to remote stream: ${url}`)
        return await this.call('SetInputSettings', {
            inputName: inputName,
            inputSettings: {
                input: url
            }
        })
    }

    private async setVolume(streamIndex: number, level: number) {
        const inputName = `stream_${streamIndex}`
        logger.info(`Setting ${inputName} volume to: ${level}`)
        return await this.call('SetInputVolume', {
            inputName: inputName,
            inputVolumeMul: level
        })
    }
}