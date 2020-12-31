import * as fs from "fs";
import { log_error } from "./shared_functions";

const INDENT = "  ";

export class CueSheet {
  public current_track: number;
  public file_path: string;

  constructor(dj: string, timestamp: number | string, path: string) {
    this.current_track = 1;
    this.file_path = path;
    const cue_text = "".concat(`PERFORMER "${dj}"\n`, `TITLE "${timestamp}"\n`, `FILE "raw_recording.mp3" MP3\n`);
    fs.writeFile(path, cue_text, (err) => {
      if (err) {
        log_error(err);
      }
    });
  }

  public add_song(title: string, timestamp: number | string, artist?: string, ending?: string) {
    return new Promise<void>((resolve) => {
      let append_text = `${INDENT}TRACK ${this.pad(this.current_track)} AUDIO\n`;
      append_text = append_text.concat(`${INDENT}${INDENT}TITLE "${title}"\n`);
      if (artist) {
        append_text = append_text.concat(`${INDENT}${INDENT}PERFORMER "${artist}"\n`);
      }
      append_text = append_text.concat(`${INDENT}${INDENT}INDEX 01 ${this.format_timestamp(timestamp)}\n`);
      this.current_track += 1;
      const stream = fs.createWriteStream(this.file_path, { flags: "a" });
      stream.write(append_text);
      stream.end();
      stream.on("finish", () => resolve());
    });
  }

  public pad(num: number) {
    if (num < 10) {
      return `0${num}`;
    }

    return num;
  }

  public format_timestamp(timestamp: number | string) {
    if (typeof timestamp === "string") {
      return timestamp;
    }
    const minutes = Math.floor(timestamp / 60);
    const seconds = timestamp % 60;

    return `${this.pad(minutes)}:${this.pad(seconds)}:00`;
  }
}
