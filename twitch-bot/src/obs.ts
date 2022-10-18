import OBSWebSocket, { OBSWebSocketError, EventSubscription } from 'obs-websocket-js'
import { logger } from '.'
import { getTwitchHlsStream } from './twitch'
import { Lock } from "async-await-mutex-lock"

export class ObsWSClient extends OBSWebSocket {
    private address: string
    private challenge: string
    private prefix: string
    private connectionPending: Lock<string>
    private isConnected: boolean
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
            this.isConnected = true
        } catch(error) {
            logger.error(`Failed to connect to websocket: ${error}`)
            this.isConnected = false
        } finally {
            this.connectionPending.release()
            return this.isConnected
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

        const index = Number.parseInt(args[2],10)
        if (!Number.isFinite(index) || index > 4 || index < 0) {
            logger.warn(`[MALFORMED ARGS][${username}]: ${args}`)
            return;
        }
        
        if(args.length == 3) {
            const nullStream = ''
            logger.info(`Un-setting stream_${index}!`)
            instance.setVisibility(index, false)
            instance.setStream(index)
                .then(res => logger.info)
                .catch(e => logger.error)
        } else {
            const channel = args[3].toLowerCase()
            getTwitchHlsStream(channel)
                .then((url: string) => {
                    logger.info(`Setting stream_${index} to https://twitch.tv/${channel}`)

                    instance.setCountdown(index, channel)
                        .then(() => {
                            instance.setStream(index, url)
                                .then(() => {
                                    instance.setVisibility(index, true)
                                })
                                .catch(e => logger.error)
                        })

                })
                .catch(e => logger.error)
        }
    }

    private handleSetVolumeCommand(instance: ObsWSClient, username: string, args) {
        if (args.length < 3 || args.length > 4) {
            logger.warn(`[MALFORMED ARGS][${username}]: ${args}`)
            return
        }

        const index = Number.parseInt(args[2],10)
        var level = Number.parseFloat(args[3])
        
        if (!Number.isFinite(index) || !Number.isFinite(level) || index > 4 || index < 0){
            logger.warn(`[MALFORMED ARGS][${username}]: ${args}`)
            return
        }
        
        level = level < 0 ? 0 : level > 20 ? 20 : level

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

    private async setStream(streamIndex: number, url: string = '') {
        const name = `stream_${streamIndex}`
        return await this.call('SetInputSettings', {
            inputName: name,
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

    private async setVisibility(index: number, enabled: boolean) {
        const name = `stream_${index}`
        const scene = (await this.call('GetCurrentProgramScene')).currentProgramSceneName
        const id = (await this.call('GetSceneItemId', {sceneName: scene, sourceName: name})).sceneItemId

        await this.call('SetSceneItemEnabled', {
            sceneName: scene,
            sceneItemId: id,
            sceneItemEnabled: enabled
        })
    }

    private async setCountdown(index: number, channel: string, delay: number = 3) {
        const name = `countdown_${index}`
        const scene = (await this.call('GetCurrentProgramScene')).currentProgramSceneName
        const kind = (await this.call('GetInputKindList')).inputKinds.filter(i => i.match('text_.*'))[0]
        const videoSettings = await this.call('GetVideoSettings')

        await this.call('CreateInput', {
            sceneName: scene,
            inputName: name,
            inputKind: kind
        })
        const id = (await this.call('GetSceneItemId', {sceneName: scene, sourceName: name})).sceneItemId


        await this.call('SetInputSettings', {
            inputName: name,
            inputSettings: {
                font: {
                    size: 32
                }
            }
        })

        var x: number
        var y: number
        switch(index) {
            case 0: {
                x = videoSettings.baseWidth / 2
                y = videoSettings.baseHeight / 2
                break
            }
            case 1: {
                x = videoSettings.baseWidth / 4
                y = videoSettings.baseHeight / 4
                break
            }
            case 2: {
                x = 3 * videoSettings.baseWidth / 4
                y = videoSettings.baseHeight / 4
                break
            }
            case 3: {
                x = videoSettings.baseWidth / 4
                y = 3* videoSettings.baseHeight / 4
                break
            }
            case 4: {
                x = 3 * videoSettings.baseWidth / 4
                y = 3 * videoSettings.baseHeight / 4
                break
            }
        }

        await this.call('SetSceneItemTransform', {
            sceneName: scene,
            sceneItemId: id,
            sceneItemTransform: {
                positionX: x,
                positionY: y,
                alignment: 0
            }
        })

        for(var i = delay; i > 0; i--) {
            await this.call('SetInputSettings', {
                inputName: name,
                inputSettings: {
                    text: `Adding ${channel} as stream #${index} in ${i}s...`
                }
            })

            await this.msleep(1000)
        }

        await this.call('RemoveInput', {
            inputName: name
        })
    }
}
