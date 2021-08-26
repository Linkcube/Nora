import * as ffmpeg from "fluent-ffmpeg";
import { createReadStream, Dirent, existsSync, readdirSync, unlinkSync } from "fs";
import { isEmpty } from "lodash";
import { dirname, join, resolve } from "path";
import * as readline from "readline";
import { CueSheet } from "./cue_sheet";
import { writeSongMeta } from "./recording_reader";
import { format_seconds, log_error, print } from "./shared_functions";
import { cpus } from "os";
const sane_fs = require("sanitize-filename");

const nodeID3 = require("node-id3");
// Platform agnostic ffmpeg/ffprobe install
const ffmpegPath: string = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);
const ffprobePath: string = require("@ffprobe-installer/ffprobe").path;
ffmpeg.setFfprobePath(ffprobePath);

function multi_thread(cue: CueParser, indexes: number[]) {
  return new Promise<void>(async (res) => {
    for (const index of indexes) {
      await split_song(cue, index);
    }
    res();
  });
}

function cleanup_post_processing(cue: CueParser) {
  try {
    unlinkSync(cue.recording);
    unlinkSync(cue.cueFile);
  } catch (err) {
    log_error(err);
  }

  print("Finished splitting");
}

function split_song(cue: CueParser, trackIndex: number) {
  if (cue.getSongDuration(trackIndex) === 0) {
    return null;
  }
  return new Promise<void>((res, reject) => {
    ffmpeg(cue.recording)
      .output(cue.makeSongFile(trackIndex))
      .seek(cue.formatTrackIndex(trackIndex))
      .audioBitrate(192)
      .audioChannels(2)
      .audioFrequency(44100)
      .duration(cue.getSongDuration(trackIndex))
      .on("end", () => {
        // ID3 tagging
        const tags = {
          title: cue.tracks[trackIndex].title,
          artist: cue.tracks[trackIndex].performer || cue.albumArtist,
          album: cue.albumTitle,
          APIC: cue.cover,
          trackNumber: cue.tracks[trackIndex].track,
          date: cue.albumTitle,
          performerInfo: cue.albumArtist,
        };
        nodeID3.write(tags, cue.makeSongFile(trackIndex));
        res();
      })
      .on("error", (err: Error) => {
        if (err) {
          log_error(err);
        }
        reject();
      })
      .run();
  });
}

function single_thread(cue: CueParser) {
  return new Promise<void>(async (res, reject) => {
    print("Starting single thread");
    const reader = ffmpeg(cue.recording)
      .audioBitrate(192)
      .audioChannels(2)
      .audioFrequency(44100)
      .seekInput(0)
      .on("error", (err: Error) => {
        if (err) {
          log_error(err);
        }
        reject();
      });
    let i = 0;
    for await (const track of cue.tracks) {
      reader.output(cue.makeSongFile(i));
      if (i < cue.tracks.length - 1) {
        reader.seek(cue.getSongDuration(i));
      }
      i += 1;
    }
    reader
      .on("end", async () => {
        print("Tagging");
        // ID3 tagging
        let n = 0;
        for await (const track of cue.tracks) {
          const tags = {
            title: cue.tracks[n].title,
            artist: cue.tracks[n].performer || cue.albumArtist,
            album: cue.albumTitle,
            APIC: cue.cover,
            trackNumber: cue.tracks[n].track,
            date: cue.albumTitle,
            performerInfo: cue.albumArtist,
          };
          nodeID3.write(tags, cue.makeSongFile(n));
          n += 1;
        }
        res();
      })
      .run();
  });
}

export function process_recording(cue: CueParser) {
  // Actual splitting
  if (cue.tracks.length !== 0) {
    print(`Splitting ${cue.directory}`);

    ffmpeg(cue.recording).ffprobe((err: Error, data: any) => {
      if (err) {
        log_error(err);
        return;
      }

      // Split the file
      let threads = cpus().length / 2;
      // Multi-thread
      const promises = [];
      const indexList = [];
      for (let i = 0; i < cue.tracks.length; i++) {
        indexList.push(i);
      }
      for (let i = 0; i < threads; i++) {
        const subList = indexList.slice((indexList.length / threads) * i, (indexList.length / threads) * (i + 1));
        promises.push(multi_thread(cue, subList));
      }
      Promise.all(promises)
        .then(() => {
          cleanup_post_processing(cue);
          writeSongMeta(cue.directory);
        })
        .catch((error: Error) => {
          log_error(error);
        });
    });
  }
}

export function splitCueSheet(folder: string) {
  const cue = new CueParser(join(folder, "proto.cue"));
  cue.parseCueSheet().then(() => process_recording(cue));
}

export function createCompliantCueSheets(folder: string) {
  const cue = new CueParser(join(folder, "proto.cue"));
  cue.parseCueSheet().then(() => cue.exportCompliantSheets());
}

interface ICueTrack {
  track: number;
  title: string;
  performer?: string;
  index: string;
}

export class CueParser {
  public albumArtist: string;
  public albumTitle: string;
  public file: string;
  public tracks: ICueTrack[];
  public cueFile: string;
  public directory: string;
  public recording: string;
  public cover?: string;

  constructor(cuePath: string) {
    this.albumArtist = "";
    this.albumTitle = "";
    this.file = "";
    this.tracks = [];
    this.cueFile = cuePath;
    this.directory = resolve(dirname(cuePath));
    this.recording = join(this.directory, "raw_recording.mp3");

    this.findCover();
  }

  public async parseCueSheet() {
    if (!existsSync(this.cueFile)) {
      print(`Error! Cannot find cue at ${this.cueFile}. Skipping parse`);
      return;
    }
    let useTracks = false;
    let currentTrack: ICueTrack = {
      track: 1,
      title: "",
      index: "",
    };
    const rl = readline.createInterface({
      input: createReadStream(this.cueFile),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const splits = line.trim().split(" ");

      if (useTracks) {
        if (splits[0] === "TRACK") {
          currentTrack = {
            track: Number(splits[1]),
            title: "",
            index: "",
          };
        } else if (splits[0] === "TITLE") {
          const name = splits.slice(1).join(" ");
          currentTrack.title = name.substring(1, name.length - 1);
        } else if (splits[0] === "PERFORMER") {
          const name = splits.slice(1).join(" ");
          currentTrack.performer = name.substring(1, name.length - 1);
        } else if (splits[0] === "INDEX") {
          const index = splits[2];
          currentTrack.index = index;
          this.tracks.push(currentTrack);
        }
      } else {
        if (splits[0] === "PERFORMER") {
          const name = splits.slice(1).join(" ");
          this.albumArtist = name.substring(1, name.length - 1);
        } else if (splits[0] === "TITLE") {
          const name = splits.slice(1).join(" ");
          this.albumTitle = name.substring(1, name.length - 1);
        } else if (splits[0] === "FILE") {
          const name = splits.slice(1, splits.length - 1).join(" ");
          this.file = name.substring(1, name.length - 1);
        } else if (splits[0] === "TRACK") {
          useTracks = true;
        }
      }
    }
  }

  public findCover() {
    const validImageExts = [
      "png",
      "jpg",
      "jpeg",
      "jfif",
      "pjpeg",
      "pjp",
      "bmp",
      "gif",
      "apng",
      "ico",
      "cur",
      "svg",
      "tif",
      "tiff",
      "webp",
    ];
    const cover = readdirSync(dirname(this.cueFile), { withFileTypes: true }).filter(
      (file: Dirent) =>
        file.isFile() &&
        validImageExts.includes(
          file.name
            .split(".")
            .splice(1, 1)
            .join("."),
        ),
    );
    if (!isEmpty(cover)) {
      this.cover = join(this.directory, cover[0].name);
    }
  }

  public exportCompliantSheets() {
    const MAX_TRACKS = 98;
    if (this.tracks.length > MAX_TRACKS) {
      const loops = Math.ceil(this.tracks.length / MAX_TRACKS);
      for (let i = 1; i < loops + 1; i++) {
        const splitSheetPath = join(dirname(this.cueFile), `cSheet-${i}.cue`);
        const cue = new CueSheet(this.albumArtist, this.albumTitle, splitSheetPath);
        const slicedTracks = this.tracks.slice((i - 1) * MAX_TRACKS, i * MAX_TRACKS);
        if (i * MAX_TRACKS < this.tracks.length) {
          slicedTracks.push({
            track: MAX_TRACKS,
            title: `End of cue sheet ${i}`,
            index: this.tracks[i * MAX_TRACKS].index,
          });
        }
        this.exportSheet(slicedTracks, cue).then(() => print(`Completed Sheet ${i}`));
      }
    }
  }

  public exportSheet(slicedTracks: ICueTrack[], cue: CueSheet) {
    return Promise.all(slicedTracks.map((track) => cue.add_song(track.title, track.index, track.performer))).then(() =>
      console.log(`Completed ${cue.file_path}`),
    );
  }

  public formatTrackIndex(index: number) {
    const times = this.tracks[index].index.split(":");
    const seconds = Number(times[1]) + 60 * Number(times[0]);
    return format_seconds(seconds);
  }

  public getSongDuration(index: number) {
    if (this.tracks[index + 1]) {
      const timesA = this.tracks[index + 1].index.split(":");
      const secondsA = Number(timesA[1]) + 60 * Number(timesA[0]);
      const timesB = this.tracks[index].index.split(":");
      const secondsB = Number(timesB[1]) + 60 * Number(timesB[0]);
      return secondsA - secondsB;
    }

    return 999999999;
  }

  public makeSongFile(index: number) {
    return join(
      this.directory,
      `${Number(this.tracks[index].track)}. ${sane_fs(this.tracks[index].title.substring(0, 15))}.mp3`,
    );
  }
}
