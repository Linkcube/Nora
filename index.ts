import * as express from "express";
import * as express_graphql from "express-graphql";
import { createWriteStream, existsSync, mkdir, readFileSync, writeFileSync } from "fs";
import { createServer } from "http";
import { clone } from "lodash";
import { format, join, parse, resolve } from "path";
import * as request from "request";
import { process } from "./helpers/recording_processor";
import { getPastRecordings, getRecordedSongs, getRecordingCover, update_reader } from "./helpers/recording_reader";
import { SCHEMA } from "./helpers/schema";
import { format_seconds, log_error, print, resolve_after_get } from "./helpers/shared_functions";
import {
  IApiObject,
  IMetaDataObject,
  IServerObject,
  ISharedDataObject,
  ISongObject,
  IUpdateDataObject,
} from "./helpers/types";

const sane_fs = require("sanitize-filename");
const cors = require("cors");

let app: any; // express app
let http_server: any;
let polling_interval_id: any;
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
let export_folder: string = join(".", "recordings_folder");
let song_list: ISongObject[] = [];
let metadata_list: IMetaDataObject[] = [];
let rec_start: number | null;
let recover_path: string = "";
let force_stop: boolean = true;
let last_rec: boolean = false;
const output_folders: string[] = [];
let excluded_djs: string[] = ["Hanyuu-sama"];
const split_character: string = " - ";
let config_file = "config.json";
let auto_save = false;

function save_config() {
  const config = {
    config: {
      api_uri,
      server_uri,
      stream_uri,
      poll_interval,
      excluded_djs,
      export_folder,
    },
  };
  writeFileSync(config_file, JSON.stringify(config));
}

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
  const filename = format({
    base: `${current_song}. ${sane_fs(api.np.substring(0, 20))}.mp3`,
    dir: join(export_folder, output_folders[output_folders.length - 1]),
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

function get_dj_pic(dj_folder: string) {
  const dj_pic_url = api_uri + "/dj-image/" + api.dj_pic;
  const dot_split = api.dj_pic.split(".");

  recover_path = format({
    base: `cover.${dot_split[dot_split.length - 1]}`,
    dir: dj_folder,
  });
  request(dj_pic_url)
    .pipe(createWriteStream(recover_path))
    .on("close", () => {
      // pass
    });
}

function start_streaming(recording_dir: string) {
  print(`Starting stream recording: ${stream_uri}`);
  print("Creating new fs stream");
  stream_request = request
    .get(stream_uri)
    .on("error", (err: Error) => {
      print(`Stream has encountered an error: ${err}.`);
      teardown().then(() => dj_change());
    })
    .on("complete", () => {
      print(`Stream request completed, restarting.`);
      teardown().then(() => dj_change());
    })
    .pipe(
      createWriteStream(
        format({
          base: "raw_recording.mp3",
          dir: recording_dir,
        }),
        { flags: "w" },
      ).on("error", (err: Error) => log_error(err)),
    );
}

function teardown() {
  return new Promise((res) => {
    if (stream_request != null) {
      stream_request.destroy();
      stream_request = null;
    }
    if (last_rec) {
      const shared_data: ISharedDataObject = {
        bitrate: server.bitrate,
        date: rec_start!,
        folder: join(export_folder, folder),
        raw_path: format({
          base: "raw_recording.mp3",
          dir: join(export_folder, folder),
        }),
        sample_rate: server.sample_rate,
      };
      process(shared_data, clone(song_list), clone(metadata_list));
      last_rec = false;
    }
    song_list = [];
    metadata_list = [];
    current_song = 1;
    rec_start = null;
    res();
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
      const output_folder = `${folder} ${api.dj_name}`;
      const dj_folder = join(export_folder, output_folder);
      mkdir(dj_folder, (err) => {
        if (err && err.code !== "EEXIST") {
          log_error(err);
          throw err;
        }
        output_folders.push(output_folder);
        song_change();
        get_dj_pic(dj_folder);
      });
      const recording_folder = join(export_folder, folder);
      mkdir(recording_folder, (err) => {
        if (err && err.code !== "EEXIST") {
          log_error(err);
          throw err;
        }
        current_song = 1;
        print("Setting up the stream");
        rec_start = api.current_time;
        last_rec = true;
        start_streaming(recording_folder);
      });
    } else {
      const new_folder = sane_fs(`${Math.floor(Date.now() / 1000)}`);
      const output_folder = `${new_folder} ${api.dj_name}`;
      const dj_folder = join(export_folder, output_folder);
      mkdir(dj_folder, (err) => {
        if (err && err.code !== "EEXIST") {
          log_error(err);
          throw err;
        }
        output_folders.push(output_folder);
        song_change();
        get_dj_pic(dj_folder);
      });
      current_song = 1;
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
  http_server = createServer(app);
  app.use(express.static(resolve(export_folder)));
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
    new_export_path = format(parse("."));
  } else {
    new_export_path = format(parse(data.config.export_folder));
  }
  if (export_folder !== new_export_path) {
    teardown().then(() => {
      mkdir(new_export_path, (err) => {
        if (err && err.code !== "EEXIST") {
          log_error(err);
          throw err;
        }
        export_folder = new_export_path;
        update_reader(export_folder);
        app.use(express.static(resolve(export_folder)));
        if (auto_save) {
          save_config();
        }
        dj_change();
      });
    });
  } else {
    if (auto_save) {
      save_config();
    }
    dj_change();
  }
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
  return true;
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
  past_recordings: getPastRecordings,
  recording_cover: getRecordingCover,
  full_recording: getRecordedSongs,
  printLog,
  streamAction,
};

export function stop_everything() {
  app.close();
  http_server.close();
  clearInterval(polling_interval_id);
}

export function initial_start(options: { config: string; default: boolean; auto: boolean }) {
  let config;
  config_file = options.config ? options.config : "config.json";
  if (options.config && existsSync(options.config)) {
    config = JSON.parse(readFileSync(options.config, "utf-8")).config;
  } else if (options.default) {
    if (existsSync(config_file)) {
      config = JSON.parse(readFileSync(config_file, "utf-8")).config;
    } else {
      save_config();
    }
  }

  if (config) {
    api_uri = config.api_uri;
    server_uri = config.server_uri;
    stream_uri = config.stream_uri;
    poll_interval = config.poll_interval;
    excluded_djs = config.excluded_djs;
    if (config.export_folder === "") {
      export_folder = format(parse("."));
    } else {
      export_folder = format(parse(config.export_folder));
    }
  }

  auto_save = options.auto;

  mkdir(export_folder, (err) => {
    if (err && err.code !== "EEXIST") {
      log_error(err);
      throw err;
    }
  });

  update_reader(export_folder);
  start_server();
  start_polling();
}
