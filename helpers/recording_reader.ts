const fs = require('fs');
const path = require('path');
const NodeID3 = require('node-id3');
const _ = require('lodash');

let export_folder;
let max_dirs_sent = 0;

export function update_reader(new_export_folder) {
    export_folder = new_export_folder;
}

export const getPastRecordings = () => {
    let dirs = fs.readdirSync(export_folder, { withFileTypes: true }).filter(
        file => (file.isDirectory() && file.name.split(' ').length === 2)
    ).map(dir => dir.name);
    let result = [];
    dirs.reverse();
    if (max_dirs_sent > 0) dirs = dirs.slice(0, max_dirs_sent);
    dirs.forEach((dir) => {
        result.push({ folder: dir, songs: getSongCount(dir), cover: getRecordingCoverPath(dir) });
    });
    return { recordings: result };
};

export const getRecordedSongs = (data) => {
    let dirs = fs.readdirSync(path.join(export_folder, data.folder), { withFileTypes: true }).filter(
        file => (file.isFile() && file.name.split(' ').length > 1)
    );
    dirs.sort((a, b) => {
        return a.name.split('.')[0] - b.name.split('.')[0];
    });
    return { songs: dirs.map(dir => getSongMetadata(path.join(export_folder, data.folder), dir.name))};
};

const getSongMetadata = (folder, file) => {
    let tags = NodeID3.read(path.join(folder, file));
    return { title: tags.title, artist: tags.artist, file: file };
}

const getSongCount = (folder) => {
    let dirs = fs.readdirSync(path.join(export_folder, folder), { withFileTypes: true }).filter(
        file => (file.isFile() && file.name.split(' ').length > 1)
    );
    return dirs.length;
};

export const getRecordingCover = (data) => {
    let cover = fs.readdirSync(path.join(export_folder, data.folder), { withFileTypes: true }).filter(
        file => (file.isFile() && file.name.split('.').slice(0, 1).join('.') === "cover")
    );
    let cover_path = path.join(export_folder, data.folder, cover[0].name);

    return { cover: fs.readFileSync(cover_path, 'base64')};
};

const getRecordingCoverPath = (folder) => {
    let cover = fs.readdirSync(path.join(export_folder, folder), { withFileTypes: true }).filter(
        file => (file.isFile() && file.name.split('.').slice(0, 1).join('.') === "cover")
    );
    if (_.isEmpty(cover)) {
        return null;
    }
    return encodeURI(path.join(folder, cover[0].name));
};