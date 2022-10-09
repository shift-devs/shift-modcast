import * as twitch from "twitch-m3u8";
import OBSWebSocket from 'obs-websocket-js';

const args = process.argv;
const obs = new OBSWebSocket();
try {
	const { obsWebSocketVersion, negotiatedRpcVersion } = await obs.connect(
			`ws://127.0.0.1:4455`
	);
	console.log(
			`[NOTICE] OBSWS: Connected to server ${obsWebSocketVersion} (using RPC ${negotiatedRpcVersion})`
	);
} catch (error) {
	console.error("[ERROR] OBSWS: Failed to connect", error.code, error.message);
	process.exit();
}

function sleep(time) {
	return new Promise((res, rej) => {
		const stopTime = new Date().getTime() + time;

		while (new Date().getTime() < stopTime) {;}
		return res(true);
	});
}
		
const streamSource = args[2];
const hlsUrl = twitch.getStream(streamSource)
	.then(async (data) => {
		const hlsUrl = data[0].url;

		const stop = new Date().getTime() + 3600;

		while(true) {
			obs.call("SetInputSettings", {
				inputName: "stream_0",
				inputSettings: {
					input: hlsUrl
				},
			});
			obs.call("SetInputSettings", {
				inputName: "stream_1",
				inputSettings: {
					input: hlsUrl
				},
			});
			obs.call("SetInputSettings", {
				inputName: "stream_2",
				inputSettings: {
					input: hlsUrl
				},
			});
			obs.call("SetInputSettings", {
				inputName: "stream_3",
				inputSettings: {
					input: hlsUrl
				},
			});
			obs.call("SetInputSettings", {
				inputName: "stream_4",
				inputSettings: {
					input: hlsUrl
				},
			});

			console.log(`Updated ${new Date()}`);
			await sleep(60000);
		}
	});
