#!/usr/bin/env node

import { SCHEMA } from "./helpers/schema";
import { format_seconds, print, resolve_after_get } from "./helpers/shared_functions";
import {
  IApiObject,
  IErrorType,
  IMetaDataObject,
  IServerObject,
  ISongObject,
  IUpdateDataObject,
} from "./helpers/types";

let app: any; // express app
let http_server: any;
let polling_interval_id: any;
const http = require("http");
const fs = require("fs");
const path = require("path");
const sane_fs = require("sanitize-filename");
const request = require("request");
const _ = require("lodash");
const express = require("express");
const express_graphql = require("express-graphql");
const cors = require("cors");
const recording_reader = require("./helpers/recording_reader");
const recording_processor = require("./helpers/recording_processor");
let api_uri: string = "https://r-a-d.io/api";
let server_uri: string = "https://stream.r-a-d.io/status-json.xsl";
let stream_uri: string = "https://relay0.r-a-d.io/main.mp3";
let poll_interval: number = 5000;
let server: IServerObject = {
  audio_format: "",
  bitrate: 0,
  sample_rate: 0,
  server_description: "",
  server_name: "",
};
let api: IApiObject = {
  current_time: 0,
  dj_name: "",
  dj_pic: "",
  end_time: 0,
  listeners: 0,
  lp: [],
  np: "",
  start_time: 0,
};
let current_song: number = 1;
let stream_request: any;
let folder: string = "";
let export_folder: string = path.join(".", "recordings_folder");
let song_list: ISongObject[] = [];
let metadata_list: IMetaDataObject[] = [];
let rec_start: number | null;
let recover_path: string = "";
let force_stop: boolean = true;
let last_rec: boolean = false;
const output_folders: string[] = [];
let excluded_djs: string[] = ["Hanyuu-sama"];
const split_character: string = " - ";

function gen_song_meta(filename: string) {
  let artist;
  let song_name;
  if (api.np.split(split_character).length === 2) {
    song_name = api.np.split(split_character)[1];
    artist = api.np.split(split_character)[0];
  } else {
    song_name = api.np;
    artist = api.dj_name;
  }
  return {
    song_name,
    artist,
    location: filename,
    track: current_song,
  };
}

function song_change() {
  let start = 0;
  if (rec_start) {
    start = Math.max(0, api.start_time - rec_start);
  }
  const filename = path.format({
    base: `${current_song}. ${sane_fs(api.np.substring(0, 20))}.mp3`,
    dir: path.join(export_folder, output_folders[output_folders.length - 1]),
  });
  song_list.push({
    start,
    filename,
    dj: api.dj_name,
    cover: recover_path,
    album: output_folders[output_folders.length - 1],
  });
  metadata_list.push(gen_song_meta(filename));
  print(current_song + ". " + sane_fs(api.np) + " ::" + format_seconds(start) + "::");
  current_song += 1;
}

function get_dj_pic() {
  const dj_pic_url = api_uri + "/dj-image/" + api.dj_pic;
  const dot_split = api.dj_pic.split(".");

  recover_path = path.format({
    base: `cover.${dot_split[dot_split.length - 1]}`,
    dir: path.join(export_folder, output_folders[output_folders.length - 1]),
  });
  request(dj_pic_url)
    .pipe(fs.createWriteStream(recover_path))
    .on("close", () => {
      // pass
    });
}

function start_streaming(parent_dir: string) {
  print(`Starting stream recording: ${stream_uri}`);
  print("Creating new fs stream");
  stream_request = request
    .get(stream_uri)
    .on("error", (err: IErrorType) => {
      print(`Stream has encountered an error: ${err}.`);
      teardown().then(() => dj_change());
    })
    .on("complete", () => {
      print(`Stream request completed, restarting.`);
      teardown().then(() => dj_change());
    })
    .pipe(
      fs.createWriteStream(
        path.format({
          base: "raw_recording.mp3",
          dir: path.join(parent_dir, folder),
        }),
        { flags: "w" },
      ),
    );
}

function teardown() {
  return new Promise(() => {
    if (stream_request != null) {
      stream_request.destroy();
      stream_request = null;
    }
    if (last_rec) {
      const shared_data = {
        bitrate: server.bitrate,
        date: rec_start,
        folder: path.join(export_folder, folder),
        raw_path: path.format({
          base: "raw_recording.mp3",
          dir: path.join(export_folder, folder),
        }),
        sample_rate: server.sample_rate,
      };
      recording_processor.process(shared_data, _.clone(song_list), _.clone(metadata_list));
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
      print(`Excluded DJ ${api.dj_name} detected, skipping.`);
    }
    return teardown();
  }
  return new Promise(() => {
    print(api.dj_name + " has taken over.");
    if (last_rec === false) {
      folder = sane_fs(`${Math.floor(Date.now() / 1000)}`);
      fs.mkdir(path.join(export_folder, `${folder} ${api.dj_name}`), (err: IErrorType) => {
        if (err && err.code !== "EEXIST") {
          throw err;
        }
      });
      fs.mkdir(path.join(export_folder, folder), (err: IErrorType) => {
        if (err && err.code !== "EEXIST") {
          throw err;
        }
        current_song = 1;
        print("Setting up the stream");
        rec_start = api.current_time;
        last_rec = true;
        get_dj_pic();
        song_change();
        start_streaming(export_folder);
      });
      output_folders.push(folder + " " + api.dj_name);
    } else {
      const new_folder = sane_fs(`${Math.floor(Date.now() / 1000)}`);
      fs.mkdir(path.join(export_folder, `${new_folder} ${api.dj_name}`), (err: IErrorType) => {
        if (err && err.code !== "EEXIST") {
          throw err;
        }
      });
      output_folders.push(new_folder + " " + api.dj_name);
      current_song = 1;
      get_dj_pic();
      song_change();
    }
  });
}

function poll_api() {
  resolve_after_get(api_uri).then((results: { main: any }) => {
    try {
      let old_np;
      let old_dj;
      if (Object.keys(api).length !== 0) {
        old_np = api.np;
        old_dj = api.dj_name;
      } else {
        old_dj = "";
      }
      api = {
        current_time: results.main.current,
        dj_name: results.main.dj.djname,
        dj_pic: results.main.dj.djimage,
        end_time: results.main.end_time,
        listeners: results.main.listeners,
        lp: results.main.lp,
        np: results.main.np,
        start_time: results.main.start_time,
      };
      if (force_stop) {
        return;
      }
      if (api.dj_name !== old_dj) {
        dj_change();
      } else if (api.np !== old_np) {
        if (!excluded_djs.includes(api.dj_name)) {
          song_change();
        }
      }
    } catch (_) {
      // pass
    }
  });
}

function poll_server() {
  resolve_after_get(server_uri).then((results: { icestats: any }) => {
    try {
      const stats = results.icestats.source[0];
      const stream = results.icestats.source[1];
      server = {
        audio_format: stats.server_type,
        bitrate: stats.bitrate,
        sample_rate: stats.samplerate,
        server_description: stream.server_description,
        server_name: stream.server_name,
      };
      // stream_uri = stream.listenurl;
    } catch (_) {
      // pass
    }
  });
}

function start_server() {
  app = express();
  app.use(cors()); // For graphql over http
  app.use(
    "/graphql",
    express_graphql({
      graphiql: true,
      rootValue: root,
      schema: SCHEMA,
    }),
  );
  app.listen(4000, () => print("Express GraphQL Server Now Running On localhost:4000/graphql"));
  http_server = http.createServer(app);
  app.use(express.static(path.resolve(export_folder)));
  http_server.listen(8080);
  print("HTTP server running on localhost:8080");
}

function start_polling() {
  force_stop = false;
  poll_api();
  poll_server();
  setTimeout(() => {
    polling_interval_id = setInterval(poll_api, poll_interval);
  }, 1000);
}

const getApi = () => {
  return api;
};

const getServer = () => {
  return server;
};

const isValidDj = () => {
  const valid = {
    force_stop,
    valid_dj: !excluded_djs.includes(api.dj_name),
  };
  return valid;
};

const getMiscData = () => {
  return {
    dj_image_link: api_uri + "/dj-image/" + api.dj_pic,
    rec_start,
  };
};

const getConfigData = () => {
  return {
    api_uri,
    server_uri,
    stream_uri,
    poll_interval,
    excluded_djs,
    export_folder,
  };
};

const updateConfig = (data: IUpdateDataObject) => {
  print(data);
  api_uri = data.config.api_uri;
  server_uri = data.config.server_uri;
  stream_uri = data.config.stream_uri;
  poll_interval = data.config.poll_interval;
  excluded_djs = data.config.excluded_djs;
  let new_export_path: string;
  if (data.config.export_folder === "") {
    new_export_path = path.format(path.parse("."));
  } else {
    new_export_path = path.format(path.parse(data.config.export_folder));
  }
  if (export_folder !== new_export_path && !force_stop) {
    teardown();
    fs.mkdir(new_export_path, (err: IErrorType) => {
      if (err && err.code !== "EEXIST") {
        throw err;
      }
      export_folder = new_export_path;
      recording_reader.update_reader(export_folder);
      app.use(express.static(path.resolve(export_folder)));
    });
  }
  dj_change();
  return "Changed";
};

const streamAction = (data: { action: string }) => {
  print(data);
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
};
const printLog = (msg: string) => {
  print(msg);
  return msg;
};

const root = {
  api: getApi,
  server: getServer,
  valid: isValidDj,
  misc: getMiscData,
  config: getConfigData,
  updateConfig,
  past_recordings: recording_reader.getPastRecordings,
  recording_cover: recording_reader.getRecordingCover,
  full_recording: recording_reader.getRecordedSongs,
  printLog,
  streamAction,
};

export function stop_everything() {
  app.close();
  http_server.close();
  clearInterval(polling_interval_id);
}

export function initial_start(config_file: string) {
  if (config_file) {
    const config = JSON.parse(fs.readFileSync(config_file));
    updateConfig(config);
  }

  fs.mkdir(export_folder, (err: IErrorType) => {
    if (err && err.code !== "EEXIST") {
      throw err;
    }
  });

  recording_reader.update_reader(export_folder);
  start_server();
  start_polling();
}
