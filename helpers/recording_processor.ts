import * as ffmpeg from "fluent-ffmpeg";
import { readFileSync, writeFile } from "fs";
import { dirname, format, join } from "path";
import * as rmdir from "rimraf";
import { writeSongMeta } from "./recording_reader";
import { format_seconds, log_error, print } from "./shared_functions";
import { IMetaDataObject, ISharedDataObject, ISongObject } from "./types";

const nodeID3 = require("node-id3");
// Platform agnostic ffmpeg/ffprobe install
const ffmpegPath: string = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);
const ffprobePath: string = require("@ffprobe-installer/ffprobe").path;
ffmpeg.setFfprobePath(ffprobePath);

function multi_thread(shared_data: ISharedDataObject, song_list: ISongObject[], meta_list: IMetaDataObject[]) {
  return new Promise(async (resolve) => {
    for (let i = 0; i < song_list.length; i++) {
      const song = song_list[i];
      const meta = meta_list[i];
      await split_song(shared_data, song, meta);
    }
    resolve();
  });
}

function cleanup_post_processing(shared_data: ISharedDataObject) {
  rmdir(shared_data.folder, (err) => {
    if (err) {
      log_error(err);
    }
  });
  print("Finished splitting");
}

function split_song(shared_data: ISharedDataObject, song: ISongObject, meta: IMetaDataObject) {
  if (song.duration === 0) {
    return null;
  }
  return new Promise((resolve, reject) => {
    ffmpeg(shared_data.raw_path)
      .output(song.filename)
      .seek(format_seconds(song.start))
      .audioBitrate(shared_data.bitrate)
      .audioChannels(2)
      .audioFrequency(shared_data.sample_rate)
      .duration(song.duration!)
      .on("end", () => {
        // ID3 tagging
        const tags = {
          title: meta.song_name,
          artist: meta.artist,
          album: song.album,
          APIC: song.cover,
          trackNumber: meta.track,
          date: shared_data.date,
          performerInfo: song.dj,
        };
        nodeID3.write(tags, song.filename);
        resolve();
      })
      .on("error", (err: Error) => {
        if (err) {
          log_error(err);
          throw err;
        }
        reject();
      })
      .run();
  });
}

export function process_recording(
  song_list: ISongObject[],
  meta_list: IMetaDataObject[],
  shared_data: ISharedDataObject,
) {
  // Handle older recordings
  if (!shared_data.hasOwnProperty("bitrate")) {
    shared_data.bitrate = 192;
  }
  if (!shared_data.hasOwnProperty("sample_rate")) {
    shared_data.sample_rate = 44100;
  }

  // Actual splitting
  if (Object.keys(song_list).length !== 0) {
    print(`Splitting ${shared_data.folder}`);

    ffmpeg(shared_data.raw_path).ffprobe((err: Error, data: any) => {
      if (err) {
        log_error(err);
        throw err;
      }
      // Calculate duration of each song
      let song_count = 0;
      song_list.forEach((song) => {
        let duration;
        if (song_count === song_list.length - 1) {
          duration = data.format.duration;
        } else if (song.start > data.format.duration) {
          print(`Error: song starts after end of stream ${song.filename}`);
          duration = 0;
          song.start = 0;
        } else {
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
      const promises = [];
      for (let i = 0; i < threads; i++) {
        const sub_song = song_list.slice((song_list.length / threads) * i, (song_list.length / threads) * (i + 1));
        const sub_meta = meta_list.slice((meta_list.length / threads) * i, (meta_list.length / threads) * (i + 1));

        promises.push(multi_thread(shared_data, sub_song, sub_meta));
      }
      Promise.all(promises)
        .then(() => {
          cleanup_post_processing(shared_data);
          let last_album = "";
          song_list.forEach((song) => {
            if (last_album !== song.album) {
              last_album = song.album;
              writeSongMeta(join(dirname(shared_data.folder), last_album));
            }
          });
        })
        .catch((error: Error) => {
          log_error(error);
        });
    });
  }
}

export function load_recording_config(folder: string) {
  const shared_data_path = format({
    dir: folder,
    base: "shared_data.json",
  });
  const shared_data: ISharedDataObject = JSON.parse(readFileSync(shared_data_path, "utf-8"));

  const song_list_path = format({
    dir: folder,
    base: "song_list.json",
  });
  const song_list: ISongObject[] = JSON.parse(readFileSync(song_list_path, "utf-8"));

  const meta_list_path = format({
    dir: folder,
    base: "meta_list.json",
  });
  const meta_list: IMetaDataObject[] = JSON.parse(readFileSync(meta_list_path, "utf-8"));

  process_recording(song_list, meta_list, shared_data);
}

export function process(shared_data: ISharedDataObject, song_list: ISongObject[], meta_list: IMetaDataObject[]) {
  // Store song and meta list in case of process failure
  const song_list_path = format({
    dir: shared_data.folder,
    base: "song_list.json",
  });
  const meta_list_path = format({
    dir: shared_data.folder,
    base: "meta_list.json",
  });
  const shared_data_path = format({
    dir: shared_data.folder,
    base: "shared_data.json",
  });

  writeFile(song_list_path, JSON.stringify(song_list), "utf8", () => {
    writeFile(meta_list_path, JSON.stringify(meta_list), "utf8", () => {
      writeFile(shared_data_path, JSON.stringify(shared_data), "utf8", () => {
        process_recording(song_list, meta_list, shared_data);
      });
    });
  });
}
