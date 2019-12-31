import { promises } from "dns";

var app; // express app
var http_server; // replace with gql
var polling_interval_id;
var rp = require('request-promise');
var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var rmdir = require('rimraf');
var sane_fs = require('sanitize-filename');
var request = require('request');
var NodeID3 = require('node-id3');
var ffmpeg = require('fluent-ffmpeg');
var _ = require('lodash');
var cli_args = require('command-line-args');
// Platform agnostic ffmpeg/ffprobe install
const ffmpegPath: string = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const ffprobePath: string = require('@ffprobe-installer/ffprobe').path;
ffmpeg.setFfprobePath(ffprobePath);
var express = require('express');
var express_graphql = require('express-graphql');
var { buildSchema } = require('graphql');
var cors = require('cors');
var api_uri: string = "https://r-a-d.io/api";
var server_uri: string = "https://stream.r-a-d.io/status-json.xsl";
var stream_uri: string = "https://relay0.r-a-d.io/main.mp3";
var poll_interval: number = 5000;
interface ServerObject {
    bitrate: number,
    sample_rate: number,
    audio_format: string,
    server_name: string,
    server_description: string
}
var server: ServerObject = {
    bitrate: 0,
    sample_rate: 0,
    audio_format: "",
    server_name: "",
    server_description: ""
};
interface ApiObject {
    np: string,
    listeners: number,
    dj_name: string,
    dj_pic: string,
    start_time: number,
    end_time: number,
    current_time: number,
    lp: [],
};
var api: ApiObject = {
    np: "",
    listeners: 0,
    dj_name: "",
    dj_pic: "",
    start_time: 0,
    end_time: 0,
    current_time: 0,
    lp: [],
};
var current_song: number = 1;
var stream_request;
var folder: string = "";
var export_folder: string = path.join(".", "recordings_folder");
interface SongObject {
    start: number,
    filename: string,
    dj: string,
    cover: string,
    album: string,
    duration?: number
}
var song_list: SongObject[] = [];
interface MetaDataObject {
    song_name: string,
    artist: string,
    location: string,
    track: number,
}
var metadata_list: MetaDataObject[] = [];
var rec_start: number;
var cover_path: string = "";
var force_stop: Boolean = true;
var last_rec: Boolean = false;
var output_folders: string[] = [];
var excluded_djs: string[] = ["Hanyuu-sama"];
var split_character: string = " - ";
var max_dirs_sent: number = 10;
interface SharedDataObject {
    date: number,
    raw_path: string,
    folder: string
}
interface UpdateDataObject {
    config: UpdateConfigObject
}
interface UpdateConfigObject {
    api_uri: string,
    server_uri: string,
    stream_uri: string,
    poll_interval: number,
    excluded_djs: string[],
    export_folder: string
}

function resolve_after_get(x: string) {
    return rp(x).then(function (result: string) {
        return (JSON.parse(result));
    });
}

function format_seconds(seconds: number) {
    var measuredTime = new Date(null);
    measuredTime.setSeconds(seconds);
    return measuredTime.toISOString().substr(11, 8);
}

function gen_song_meta(filename: string) {
    var song_name, artist;
    if (api.np.split(split_character).length === 2) {
        song_name = api.np.split(split_character)[1];
        artist = api.np.split(split_character)[0];
    }
    else {
        song_name = api.np;
        artist = api.dj_name;
    }
    return {
        song_name: song_name,
        artist: artist,
        location: filename,
        track: current_song,
    };
}

function song_change() {
    let start;
    start = Math.max(0, api.start_time - rec_start);
    let filename = path.format({
        dir: path.join(
            export_folder,
            output_folders[output_folders.length - 1]
        ),
        base: `${current_song}. ${sane_fs(api.np.substring(0, 20))}.mp3`
    });
    song_list.push({
        start: start,
        filename: filename,
        dj: api.dj_name,
        cover: cover_path,
        album: output_folders[output_folders.length - 1],
    });
    metadata_list.push(gen_song_meta(filename));
    console.log(current_song + ". " + sane_fs(api.np) + " ::" + format_seconds(start) + "::");
    current_song += 1;
}

function get_dj_pic() {
    let dj_pic_url = api_uri + "/dj-image/" + api.dj_pic;
    let dot_split = api.dj_pic.split('.');

    cover_path = path.format({
        dir: path.join(
            export_folder,
            output_folders[output_folders.length - 1]
        ),
        base: `cover.${dot_split[dot_split.length - 1]}`
    });
    request(dj_pic_url).pipe(fs.createWriteStream(cover_path)).on('close', () => {
    });
}

function split_song(shared_data: SharedDataObject, song: SongObject, meta: MetaDataObject) {
    if (song.duration == 0)
        return null;
    return new Promise((resolve, reject) => {
        ffmpeg(shared_data.raw_path)
            .output(song.filename)
            .seek(format_seconds(song.start))
            .audioBitrate(server.bitrate)
            .audioChannels(2)
            .audioFrequency(server.sample_rate)
            .duration(song.duration)
            .on('end', () => {
                // ID3 tagging
                let tags = {
                    title: meta.song_name,
                    artist: meta.artist,
                    album: song.album,
                    APIC: song.cover,
                    trackNumber: meta.track,
                    date: shared_data.date,
                    performerInfo: song.dj,
                };
                NodeID3.write(tags, song.filename);
                resolve();
            })
            .on('error', (err) => {
                if (err)
                    throw err;
                reject();
            })
            .run();
    });
}

function multi_thread(shared_data: SharedDataObject, song_list: SongObject[], meta_list: MetaDataObject[]) {
    return new Promise(async (resolve, reject) => {
        for (let i = 0; i < song_list.length; i++) {
            let song = song_list[i];
            let meta = meta_list[i];
            await split_song(shared_data, song, meta);
        }
        resolve();
    });
}

function cleanup_post_processing(shared_data: SharedDataObject) {
    rmdir(shared_data.folder, (err) => {
        if (err)
            console.log(err);
    });
    console.log("Finished splitting");
}

function process_recording(shared_data: SharedDataObject, song_list: SongObject[], meta_list: MetaDataObject[]) {
    // Store song and meta list for repeat testing
    let song_list_path = path.format({
        dir: shared_data.folder,
        base: "song_list.json"
    });
    fs.writeFile(song_list_path, JSON.stringify(song_list), (err) => {
        if (err)
            console.log(err);
    });
    let meta_list_path = path.format({
        dir: shared_data.folder,
        base: "meta_list.json"
    });
    fs.writeFile(meta_list_path, JSON.stringify(meta_list), (err) => {
        if (err)
            console.log(err);
    });
    let shared_data_path = path.format({
        dir: shared_data.folder,
        base: "shared_data.json"
    });
    fs.writeFile(shared_data_path, JSON.stringify(shared_data), (err) => {
        if (err)
            console.log(err);
    });
    // Actual splitting
    if (Object.keys(song_list).length != 0) {
        console.log(`Splitting ${shared_data.folder}`);

        ffmpeg(shared_data.raw_path).ffprobe((err, data) => {
            if (err) {
                console.log(`ffprobe error: ${err}`);
                return;
            }
            // Calculate duration of each song
            let song_count = 0;
            song_list.forEach((song) => {
                let duration;
                if (song_count == song_list.length - 1) {
                    duration = data.format.duration;
                }
                else if (song.start > data.format.duration) {
                    console.log(`Error: song starts after end of stream ${song.filename}`);
                    duration = 0;
                    song.start = 0;
                }
                else {
                    duration = song_list[song_count + 1].start - song.start;
                }
                song.duration = duration;
                song_count++;
            });
            // Split the file
            let threads = 2;
            if (threads < 1) {
                // Kill the CPU
                threads = song_list.length;
            }
            // Multi-thread
            let promises = [];
            for (let i = 0; i < threads; i++) {
                let sub_song = song_list.slice(song_list.length / threads * i, song_list.length / threads * (i + 1));
                let sub_meta = meta_list.slice(meta_list.length / threads * i, meta_list.length / threads * (i + 1));
                ;
                promises.push(multi_thread(shared_data, sub_song, sub_meta));
            }
            Promise.all(promises).then(() => {
                cleanup_post_processing(shared_data);;
            }).catch(error => {
                console.log(`Caught an error when splitting: ${error}`);
            })
        });
    }
}

function start_streaming(parent_dir) {
    console.log(`Starting stream recording: ${stream_uri}`);
    console.log("Creating new fs stream");
    stream_request = request
        .get(stream_uri)
        .on('error', (err) => {
            console.log(`Stream has encountered an error: ${err}.`);
            teardown().then(() => dj_change());
        })
        .on('complete', () => {
            console.log(`Stream request completed, restarting.`);
            teardown().then(() => dj_change());
        })
        .pipe(fs.createWriteStream(path.format({
            dir: path.join(
                parent_dir,
                folder
            ),
            base: "raw_recording.mp3"
        }), { flags: 'w' }))
}

function teardown() {
    return new Promise(() => {
        if (stream_request != null) {
            stream_request.destroy();
            stream_request = null;
        }
        if (last_rec) {
            let shared_data = {
                date: rec_start,
                raw_path: path.format({
                    dir: path.join(
                        export_folder,
                        folder
                    ),
                    base: 'raw_recording.mp3'
                }),
                folder: path.join(export_folder, folder)
            };
            process_recording(shared_data, _.clone(song_list), _.clone(metadata_list));
            last_rec = false;
        }
        song_list = [];
        metadata_list = [];
        current_song = 1;
        rec_start = null;
    });
}

function dj_change() {
    // Don't break the stream on a new dj
    if (excluded_djs.includes(api.dj_name) || force_stop) {
        if (!force_stop) {
            console.log(`Excluded DJ ${api.dj_name} detected, skipping.`);
        }
        return teardown();
    }
    return new Promise(() => {
        console.log(api.dj_name + " has taken over.");
        if (last_rec == false) {
            folder = sane_fs(`${Math.floor(Date.now() / 1000)}`);
            fs.mkdir(path.join(export_folder, `${folder} ${api.dj_name}`), (err) => {
                if (err && err.code != 'EEXIST') throw err;
            });
            fs.mkdir(path.join(export_folder, folder), (err) => {
                if (err && err.code != 'EEXIST') throw err;
                current_song = 1;
                console.log("Setting up the stream");
                rec_start = api.current_time;
                last_rec = true;
                get_dj_pic();
                song_change();
                start_streaming(export_folder);
            });
            output_folders.push(folder + ' ' + api.dj_name);
        }
        else {
            let new_folder = sane_fs(`${Math.floor(Date.now() / 1000)}`);
            fs.mkdir(path.join(export_folder, `${new_folder} ${api.dj_name}`), (err) => {
                if (err && err.code != 'EEXIST') throw err;
            });
            output_folders.push(new_folder + ' ' + api.dj_name);
            current_song = 1;
            get_dj_pic();
            song_change();
        }
    });
}

function poll_api() {
    resolve_after_get(api_uri).then((results) => {
        try {
            var old_np, old_dj;
            if (Object.keys(api).length != 0) {
                old_np = api.np;
                old_dj = api.dj_name;
            }
            else {
                old_dj = "";
            }
            api = {
                np: results.main.np,
                listeners: results.main.listeners,
                dj_name: results.main.dj.djname,
                dj_pic: results.main.dj.djimage,
                start_time: results.main.start_time,
                end_time: results.main.end_time,
                current_time: results.main.current,
                lp: results.main.lp,
            };
            if (force_stop) {
                return;
            }
            if (api.dj_name != old_dj) {
                dj_change();
            }
            else if (api.np != old_np) {
                if (!excluded_djs.includes(api.dj_name)) {
                    song_change();
                }
            }
        }
        catch (_a) {
            // pass
        }
    });
}

function poll_server() {
    resolve_after_get(server_uri).then((results) => {
        try {
            var stats = results.icestats.source[0];
            var stream = results.icestats.source[1];
            server = {
                bitrate: stats.bitrate,
                sample_rate: stats.samplerate,
                audio_format: stats.server_type,
                server_name: stream.server_name,
                server_description: stream.server_description
            };
            //stream_uri = stream.listenurl;
        }
        catch (_a) {
            // pass
        }
    });
}


function start_server() {
    console.log("Starting the server");
    http_server = http.createServer(function (req, res) {
        if (req.url == "/stop") {
            force_stop = true;
            console.log("Force stopping the stream.");
            dj_change();
            res.write("Stream stopping");
        }
        if (req.url == "/start") {
            if (force_stop) {
                force_stop = false;
                dj_change();
                res.write("Stream starting");
            }
        }
        if (req.url == "/refresh") {
            dj_change();
            res.write("Refreshed!");
        }
        if (req.url == "/include") {
            excluded_djs = ["xHanyuu-sama"];
            res.write("Including Hanyuu");
        }
        if (req.url == "/exclude") {
            excluded_djs = ["Hanyuu-sama"];
            res.write("Excluding Hanyuu");
        }
        res.end();
    }).listen(8080);
}

function start_polling() {
    force_stop = false;
    poll_api();
    poll_server();
    setTimeout(() => {
        polling_interval_id = setInterval(poll_api, poll_interval);
    }, 1000);
}

var schema = buildSchema(`
    type Query {
        api: api_obj
        server: server_obj
        valid: is_valid
        misc: misc_data
        config: config_data
        past_recordings: all_recordings
        recording_songs(folder: String!): songs_data
    },
    type Mutation {
        updateConfig(config: new_config): String
        printLog(msg: String): String
    }
    type api_obj {
        np: String
        listeners: Int
        dj_name: String
        dj_pic: String
        start_time: String
        end_time: String
        current_time: String
        lp: [lp_song]
    },
    type server_obj {
        bitrate: Int
        sample_rate: Int
        audio_format: String
        server_name: String
        server_description: String
    },
    type is_valid {
        valid_dj: Boolean
        force_stop: Boolean
    }
    type misc_data {
        dj_image_link: String
        rec_start: Int
    }
    type lp_song {
        meta: String
        time: String
        type: Int
        timestamp: Int
    }
    type config_data {
        api_uri: String
        server_uri: String
        stream_uri: String
        poll_interval: Int
        excluded_djs: [String]
        export_folder: String
    }
    type all_recordings {
        recordings: [recordings_data]
    }
    type recordings_data {
        folder: String
        songs: [String]
    }
    type songs_data {
        songs: [String]
    }
    input new_config {
        api_uri: String
        server_uri: String
        stream_uri: String
        poll_interval: Int
        excluded_djs: [String]
        export_folder: String
    }
`);
var getApi = () => {
    return api;
};
var getServer = () => {
    return server;
};
var isValidDj = () => {
    let valid = {
        valid_dj: !(excluded_djs.includes(api.dj_name)),
        force_stop: force_stop,
    };
    return valid;
};
var getMiscData = () => {
    return {
        dj_image_link: api_uri + "/dj-image/" + api.dj_pic,
        rec_start: rec_start
    };
};
var getConfigData = () => {
    return {
        api_uri: api_uri,
        server_uri: server_uri,
        stream_uri: stream_uri,
        poll_interval: poll_interval,
        excluded_djs: excluded_djs,
        export_folder: export_folder
    };
};
var getPastRecordings = () => {
    let dirs = fs.readdirSync(export_folder, { withFileTypes: true }).filter(file => (file.isDirectory() && file.name.split(' ').length === 2)).map(dir => dir.name);
    let result = [];
    dirs.forEach((dir) => {
        result.push({ folder: dir, songs: getRecordedSongs(dir) });
    });
    result.reverse();
    return { recordings: result.slice(0, max_dirs_sent) };
};
var getRecordedSongs = (folder) => {
    let dirs = fs.readdirSync(folder, { withFileTypes: true }).filter(file => (file.isFile() && file.name.split(' ').length > 1));
    dirs.sort((a, b) => {
        return a.name.split('.')[0] - b.name.split('.')[0];
    });
    return dirs.map(dir => dir.name);
};
var getRecordingSongs = (data) => {
    let dirs = fs.readdirSync(data.folder, { withFileTypes: true }).filter(file => (file.isFile() && file.name.split(' ').length > 1));
    return { songs: dirs.map(dir => dir.name) };
};
var updateConfig = (data: UpdateDataObject) => {
    console.log(data);
    api_uri = data.config.api_uri;
    server_uri = data.config.server_uri;
    stream_uri = data.config.stream_uri;
    poll_interval = data.config.poll_interval;
    excluded_djs = data.config.excluded_djs;
    let new_export_path = path.format(path.parse(data.config.export_folder));
    if (export_folder !== new_export_path && !force_stop) {
        teardown();
        fs.mkdir(new_export_path, (err) => {
            if (err && err.code != 'EEXIST') throw err;
        });
        export_folder = new_export_path;
        dj_change();
    }
    dj_change();
    return "Changed";
};
var printLog = (msg: string) => {
    console.log(msg);
    return msg;
};
var root = {
    api: getApi,
    server: getServer,
    valid: isValidDj,
    misc: getMiscData,
    config: getConfigData,
    updateConfig: updateConfig,
    past_recordings: getPastRecordings,
    recording_songs: getRecordingSongs,
    printLog: printLog,
};
// GraphQL endpoint
function start_graqphl() {
    app = express();
    app.use(cors()); // For graphql over http
    app.use('/graphql', express_graphql({
        schema: schema,
        rootValue: root,
        graphiql: true
    }));
    app.listen(4000, () => console.log('Express GraphQL Server Now Running On localhost:4000/graphql'));
}

function stop_everything() {
    http_server.close();
    app.close()
    clearInterval(polling_interval_id);
}

const cli_opts = [
    { name: "load_config", alias: "l", type: String }
]

const options = cli_args(cli_opts);
if (options.load_config) {
    let load_config = JSON.parse(fs.readFileSync(options.load_config));
    updateConfig(load_config);
}

fs.mkdir(export_folder, (err) => {
    if (err && err.code != 'EEXIST') throw err;
});

start_graqphl();
start_server();
start_polling();
