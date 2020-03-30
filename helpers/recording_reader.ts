import { Dirent, existsSync, readdirSync, readFileSync, unlink, writeFileSync } from "fs";
import { isEmpty } from "lodash";
import { join } from "path";
import { print } from "./shared_functions";
import { IPastRecording, IRecordedSong } from "./types";

const nodeID3 = require("node-id3");

let export_folder: string;
const maxDirsSent = 0;

export function update_reader(new_export_folder: string) {
  export_folder = new_export_folder;
}

export const getPastRecordings = () => {
  let dirs: string[] = readdirSync(export_folder, { withFileTypes: true })
    .filter((file: Dirent) => file.isDirectory() && file.name.split(" ").length > 1)
    .map((dir: Dirent) => dir.name);
  const result: IPastRecording[] = [];
  dirs.reverse();
  if (maxDirsSent > 0) {
    dirs = dirs.slice(0, maxDirsSent);
  }
  dirs.forEach((dir: string) => {
    result.push({ folder: dir, songs: getSongCount(dir), cover: getRecordingCoverPath(dir) });
  });
  return { recordings: result };
};

export const getRecordedSongs = (data: { folder: string }) => {
  const songs_meta_path = join(export_folder, data.folder, "songs.meta");
  if (!existsSync(songs_meta_path)) {
    return { songs: writeSongMeta(join(export_folder, data.folder)) };
  }
  return { songs: JSON.parse(readFileSync(songs_meta_path, "utf-8")) };
};

export const writeSongMeta = (folder: string) => {
  let songs: IRecordedSong[];
  const songs_meta_path = join(folder, "songs.meta");
  const dirs: Dirent[] = readdirSync(folder, { withFileTypes: true }).filter(
    (file: Dirent) => file.isFile() && file.name.split(" ").length > 1,
  );
  dirs.sort((a: Dirent, b: Dirent) => {
    return Number(a.name.split(".")[0]) - Number(b.name.split(".")[0]);
  });
  songs = dirs.map((dir: Dirent) => getSongMetadata(folder, dir.name));
  unlink(songs_meta_path, (err) => {
    if (err?.code !== "ENOENT") {
      print(err);
    }
    writeFileSync(songs_meta_path, JSON.stringify(songs), "utf-8");
  });
  return songs;
};

const getSongMetadata = (folder: string, file: string) => {
  const tags = nodeID3.read(join(folder, file));
  return { title: tags.title, artist: tags.artist, file };
};

const getSongCount = (folder: string) => {
  const dirs = readdirSync(join(export_folder, folder), { withFileTypes: true }).filter(
    (file: any) => file.isFile() && file.name.split(" ").length > 1,
  );
  return dirs.length;
};

export const getRecordingCover = (data: { folder: string }) => {
  const cover = readdirSync(join(export_folder, data.folder), { withFileTypes: true }).filter(
    (file: any) =>
      file.isFile() &&
      file.name
        .split(".")
        .slice(0, 1)
        .join(".") === "cover",
  );
  const coverPath = join(export_folder, data.folder, cover[0].name);

  return { cover: readFileSync(coverPath, "base64") };
};

const getRecordingCoverPath = (folder: string) => {
  const cover = readdirSync(join(export_folder, folder), { withFileTypes: true }).filter(
    (file: Dirent) =>
      file.isFile() &&
      file.name
        .split(".")
        .slice(0, 1)
        .join(".") === "cover",
  );
  if (isEmpty(cover)) {
    return null;
  }
  return encodeURI(join(folder, cover[0].name));
};
