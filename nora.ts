import {
    ServerObject,
    ApiObject,
    SongObject,
    MetaDataObject,
    UpdateDataObject,
} from './helpers/types';
import { Schema } from './helpers/schema';

var app; // express app
var http_server;
var polling_interval_id;
var rp = require('request-promise');
var http = require('http');
var fs = require('fs');
var path = require('path');
var sane_fs = require('sanitize-filename');
var request = require('request');
var _ = require('lodash');
var cli_args = require('command-line-args');
var express = require('express');
var express_graphql = require('express-graphql');
var cors = require('cors');
var recording_reader = require('./helpers/recording_reader');
var recording_processor = require('./helpers/recording_processor');
var cli = require('./helpers/cli');
var api_uri: string = "https://r-a-d.io/api";
var server_uri: string = "https://stream.r-a-d.io/status-json.xsl";
var stream_uri: string = "https://relay0.r-a-d.io/main.mp3";
var poll_interval: number = 5000;
var server: ServerObject = {
    bitrate: 0,
    sample_rate: 0,
    audio_format: "",
    server_name: "",
    server_description: ""
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
var song_list: SongObject[] = [];
var metadata_list: MetaDataObject[] = [];
var rec_start: number;
var cover_path: string = "";
var force_stop: Boolean = true;
var last_rec: Boolean = false;
var output_folders: string[] = [];
var excluded_djs: string[] = ["Hanyuu-sama"];
var split_character: string = " - ";

function resolve_after_get(x: string) {
    return rp(x).then(function (result: string) {
        return (JSON.parse(result));
    });
};

function format_seconds(seconds: number) {
    var measuredTime = new Date(null);
    measuredTime.setSeconds(seconds);
    return measuredTime.toISOString().substr(11, 8);
};

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
};

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
};

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
};

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
};

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
                folder: path.join(export_folder, folder),
                bitrate: server.bitrate,
                sample_rate: server.sample_rate
            };
            recording_processor.process(shared_data, _.clone(song_list), _.clone(metadata_list));
            last_rec = false;
        }
        song_list = [];
        metadata_list = [];
        current_song = 1;
        rec_start = null;
    });
};

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
};

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
};

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
};

function start_server() {
    app = express();
    app.use(cors()); // For graphql over http
    app.use('/graphql', express_graphql({
        schema: Schema,
        rootValue: root,
        graphiql: true
    }));
    app.listen(4000, () => console.log('Express GraphQL Server Now Running On localhost:4000/graphql'));
    http_server = http.createServer(app)
    app.use(express.static(path.resolve(export_folder)));
    http_server.listen(8080);
    console.log("HTTP server running on localhost:8080");
};

function start_polling() {
    force_stop = false;
    poll_api();
    poll_server();
    setTimeout(() => {
        polling_interval_id = setInterval(poll_api, poll_interval);
    }, 1000);
};

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

var updateConfig = (data: UpdateDataObject) => {
    console.log(data);
    api_uri = data.config.api_uri;
    server_uri = data.config.server_uri;
    stream_uri = data.config.stream_uri;
    poll_interval = data.config.poll_interval;
    excluded_djs = data.config.excluded_djs;
    let new_export_path;
    if (data.config.export_folder === "") {
        new_export_path = path.format(path.parse("."));
    } else {
        new_export_path = path.format(path.parse(data.config.export_folder));
    }
    if (export_folder !== new_export_path && !force_stop) {
        teardown();
        fs.mkdir(new_export_path, (err) => {
            if (err && err.code != 'EEXIST') throw err;
            export_folder = new_export_path;
            recording_reader.update_reader(export_folder);
            app.use(express.static(path.resolve(export_folder)));
        });
    }
    dj_change();
    return "Changed";
};

var streamAction = (data) => {
    console.log(data);
    if (data.action === "stop") {
        force_stop = true;
        dj_change();
    } else if (data.action === "start") {
        if (force_stop) {
            force_stop = false;
            dj_change();
        }
    } else if (data.action === "refresh") {
        teardown().then(() => dj_change());
    }
}
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
    past_recordings: recording_reader.getPastRecordings,
    recording_cover: recording_reader.getRecordingCover,
    full_recording: recording_reader.getRecordedSongs,
    printLog: printLog,
    streamAction: streamAction,
};

function stop_everything() {
    app.close()
    http_server.close();
    clearInterval(polling_interval_id);
};

const options = cli_args(cli.cli_opts);

if (options.process) {
    recording_processor.process_recording(options.process);
} else if (options.start) {
    if (options.load_config) {
        let load_config = JSON.parse(fs.readFileSync(options.load_config));
        updateConfig(load_config);
    };
    
    fs.mkdir(export_folder, (err) => {
        if (err && err.code != 'EEXIST') throw err;
    });
    
    recording_reader.update_reader(export_folder);
    start_server();
    start_polling();
} else {
    console.log(cli.usage);
}
