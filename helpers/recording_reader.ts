import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { IPastRecording } from "./types";
const nodeID3 = require("node-id3");
const _ = require("lodash");

let export_folder: string;
const maxDirsSent = 0;

export function update_reader(new_export_folder: string) {
  export_folder = new_export_folder;
}

export const getPastRecordings = () => {
  let dirs = readdirSync(export_folder, { withFileTypes: true })
    .filter((file: any) => file.isDirectory() && file.name.split(" ").length === 2)
    .map((dir: any) => dir.name);
  const result: IPastRecording[] = [];
  dirs.reverse();
  if (maxDirsSent > 0) {
    dirs = dirs.slice(0, maxDirsSent);
  }
  dirs.forEach((dir: any) => {
    result.push({ folder: dir, songs: getSongCount(dir), cover: getRecordingCoverPath(dir) });
  });
  return { recordings: result };
};

export const getRecordedSongs = (data: { folder: string }) => {
  const dirs = readdirSync(join(export_folder, data.folder), { withFileTypes: true }).filter(
    (file: any) => file.isFile() && file.name.split(" ").length > 1,
  );
  dirs.sort((a: any, b: any) => {
    return a.name.split(".")[0] - b.name.split(".")[0];
  });
  return { songs: dirs.map((dir: any) => getSongMetadata(join(export_folder, data.folder), dir.name)) };
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
    (file: any) =>
      file.isFile() &&
      file.name
        .split(".")
        .slice(0, 1)
        .join(".") === "cover",
  );
  if (_.isEmpty(cover)) {
    return null;
  }
  return encodeURI(join(folder, cover[0].name));
};
