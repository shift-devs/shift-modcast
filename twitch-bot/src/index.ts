import { ArgumentParser } from 'argparse'
import { version } from '../package.json'
import createLogger from 'logging'
import { TwitchClient } from './twitch'
import { ObsWSClient } from './obs'
import { readFile } from 'jsonfile'

export const logger = createLogger('twitch-bot')

export function main() : void {
    const parser = new ArgumentParser({
        'prog': 'modcast-twitch-bot',
        'description': 'Twitch integration bot for shift modcast.'
    })
    parser.add_argument('-c', '--config', {
        'dest': 'config',
        'type': 'str',
        'default': '/etc/modcast/modcast.json'
    })
    parser.add_argument('-oh', '--obs-host', {
        'dest': 'obs_host',
        'type': 'str',
        'default': '127.0.0.1'
    })
    parser.add_argument('-op', '--obs-port', {
        'dest': 'obs_port',
        'type': 'int',
        'default': 4455
    })
    const args = parser.parse_args()

    readFile(args.config, (e: Error, config: object) => {
        const obsClient = new ObsWSClient(args.obs_host, args.obs_port, config['ws-challenge'])
        const twitchChat = new TwitchClient(config['broadcaster'])
    
        twitchChat.registerMessageHandler(obsClient, obsClient.handleTwitchMessage)
    })

}

main()