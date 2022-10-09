import * as twitchgql from "twitch-m3u8";
import tmi from "tmi.js";
import * as http from 'http';
import * as https from 'https';
import OBSWebSocket from 'obs-websocket-js';
import {readFileSync} from 'fs';

const obs = new OBSWebSocket();

const fileData = readFileSync("./settings.json").toString();
const broadcaster = JSON.parse(fileData)["broadcaster"];
const port = JSON.parse(fileData)["port"];

const usernameRegex = RegExp("^(#)?[a-zA-Z0-9][\\w]{2,24}$");

var streams = ["","","","",""];

async function streamVolume(streamStr, volumeStr) {
    var streamNumber = parseInt(streamStr,10);

    if (streamNumber > 4 || streamNumber < 0 || !Number.isInteger(streamNumber))
        return;

	var volume = parseFloat(volumeStr);

	if (!Number.isFinite(volume)) {
		return;
	}

	volume = volume > 20 ? 20 : volume < 0.001 ? 0 : volume;

	obs.call("SetInputVolume", {
		inputName: `stream_${streamNumber}`,
		inputVolumeMul: volume,
	});
}

function streamHLSURLUpdate(streamStr, hlsUrl) {
		
}

async function connectOBS(obsPass) {
	try {
		const { obsWebSocketVersion, negotiatedRpcVersion } = await obs.connect(
			`ws://127.0.0.1:4455`,
			obsPass
		);
		console.log(
			`[NOTICE] OBSWS: Connected to server ${obsWebSocketVersion} (using RPC ${negotiatedRpcVersion})`
		);
	} catch (error) {
		console.error("[ERROR] OBSWS: Failed to connect", error.code, error.message);
        process.exit();
	}
}

function connectTMI(){
    const client = new tmi.Client({
		connection: {
			reconnect: true,
		},
		channels: [broadcaster],
	});

	client.connect();

    console.log("[NOTICE] TMI Connected");

    client.on("message",(channel,tags,message,self)=>{
        var userType = "vip" in tags ? 1 : tags.mod ? 2 : tags.username.toLowerCase()==broadcaster.toLowerCase() ? 3 : 0;
        
        console.log(`(${userType==1?"VIP":userType==2?"Mod":userType==3?"Broadcaster":"User"}) ${tags.username}: ${message}`);
        
        if (userType < 1)
            return;

        var mSplit = message.toLowerCase().split(" ");

        if (mSplit[0] != "tp") // Toilet Paper
            return;

        switch (mSplit[1]){
            case "stream":
                var streamNumber = parseInt(mSplit[2],10);
                if (!Number.isInteger(streamNumber) || streamNumber > 4 || streamNumber < 0)
                    return;
                var username = mSplit[3];
                if (username == undefined || !username.match(usernameRegex)) {
                    username = "j";
                }
                twitchgql
                .getStream(username)
                .then((a) => {
                    streams[streamNumber] = a[0].url; // Get highest quality stream link
                    console.log(`[NOTICE] ${username} is now on stream #${streamNumber}`);
                })
                .catch((err) => {
                    streams[streamNumber] = "";
                    console.log(`[NOTICE] No one is streaming on stream #${streamNumber}`);
                });
                return;
            case "streamvolume":
				streamVolume(mSplit[2], mSplit[3]);
                break;
        }
    });
}

function streamHTTP(){
    var server = http.createServer((request, response) => {
        if (request.method != "GET") {
            response.writeHead(405);
            response.end("Hey! I only accept GET requests here!");
            return;
        }
        if (request.url.startsWith("/tmcds")) {
            var newrequrl = request.url.slice("/tmcds".length);
    
            if ( // Yes this sucks enormous ass.
                newrequrl == "/stream_0.m3u8" ||
                newrequrl == "/stream_1.m3u8" ||
                newrequrl == "/stream_2.m3u8" ||
                newrequrl == "/stream_3.m3u8" ||
                newrequrl == "/stream_4.m3u8"
            ) {
                var streamNumber = parseInt(newrequrl[8], 10);
                if (streams[streamNumber] != "") {
                    https
                        .get(streams[streamNumber], (res) => {
                            response.setHeader("Content-Type", "application/vnd.apple.mpegurl");
                            response.writeHead(res.statusCode);
                            res.on("data", (d) => {
                                response.write(d);
                            });
                            res.on("end", () => {
                                response.end();
                            });
                        })
                        .on("error", (e) => {
                            response.writeHead(500);
                            response.end();
                        });
                    return;
                }
                response.writeHead(425);
                response.end();
                return;
            }
            response.writeHead(444);
            response.end("Invalid tmcds page. Go somewhere else I guess.");
            return;
        }
        response.writeHead(200);
        response.end("Welcome");
        return;
    });
    server.listen(port);
    console.log(`[NOTICE] HTTP Server Listening on Port ${port}`);
}

function main(){
    try {
        var fileData = readFileSync("./settings.json").toString();
        var obsPass = JSON.parse(fileData)["obs-websocket-password"];
    } catch (e){
        console.log("[NOTICE] Could not read settings.json!");
        process.exit();
    }
    connectOBS(obsPass);
    connectTMI();
    streamHTTP();
}

main();
