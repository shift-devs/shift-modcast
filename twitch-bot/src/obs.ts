import OBSWebSocket from 'obs-websocket-js'
import { logger } from '.'
import { getTwitchHlsStream } from './twitch'

export class ObsWSClient extends OBSWebSocket {
    private address: string
    private prefix: string

    constructor(host: string, port: Number, challenge: string = '', prefix: string = '!obs') {
        super()
        this.address = `ws://${host}:${port}`
        this.prefix = prefix

        this.connect(this.address, challenge, {
            rpcVersion: 1
        }).then(() => {
            logger.info(`Connected to OBS -> ${this.address}`)
        })
        .catch((e) => {
            logger.error(e)
        })
    }

    private handleSetStreamCommand(instance: ObsWSClient, username: string, args) {
        if (args.length < 3 || args.length > 4) {
            logger.warn(`[MALFORMED ARGS][${username}]: ${args}`)
            return
        }

        const index = Number.parseInt(args[2])
        if(args.length == 3) {
            logger.info(`Setting stream_${index} to https://duckduckgo.com/`)
            instance.setStream(index, 'https://duckduckgo.com/')
                .then(res => logger.info)
                .catch(e => logger.error)
        } else {
            const channel = args[3]
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