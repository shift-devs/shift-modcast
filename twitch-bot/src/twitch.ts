import * as twitch from 'twitch-m3u8';

export async function getTwitchHlsStream(streamName: String) : Promise<Object> {
    return twitch.getStream(streamName)
}