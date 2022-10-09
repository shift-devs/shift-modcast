import { getStream } from 'twitch-m3u8'
import { Client } from 'tmi.js'
import { logger } from '.'

export class TwitchClient {
    channelName: String
    chatClient: Client

    constructor(channelName: string, debug: boolean = false) {
        this.channelName = channelName
        this.chatClient = new Client({
            connection: {
                reconnect: true,
                debug: debug
            },
            channels: [channelName],
        })

        this.chatClient.connect()
            .then(() => logger.info(`Connected to Twitch chat -> https://twitch.tv/${channelName}`))
            .catch((e) => {
                logger.error(`Failed to connect to Twitch chat for ${channelName}`)
            })
    }

    registerMessageHandler(instance: object, callable: CallableFunction) : void {
        this.chatClient.on('message', (channel, tags, message, self) => {
            callable(instance, channel, tags, message, self)
        })
    }    
}

export async function getTwitchHlsStream(streamName: String, quality: Number = 1080) : Promise<String> {
    logger.info(`Fetching available transcoding profiles for ${streamName}`)
    const transcodes = await getStream(streamName)
    logger.info(`Found ${transcodes.length} transcoding profiles for ${streamName}`)
    
    // for (const profile of transcodes) {
    //     const resolution = Number.parseInt(profile.resolution.split('x')[1])
    //     if(resolution == quality) {
    //         logger.info(`Found transcoding profile for ${quality}p!`)
    //         return profile.url
    //     }
    // }

    const defaultQuality = transcodes[0].resolution.split('x')[1]
    logger.info(`Transcoding profile for ${quality}p not found! Grabbing first available profile: ${defaultQuality}p!`)
    return transcodes[0].url
}