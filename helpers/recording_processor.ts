import {
    SongObject,
    MetaDataObject,
    SharedDataObject
} from './types';

var fs = require('fs');
var path = require('path');
var rmdir = require('rimraf');
var NodeID3 = require('node-id3');
var ffmpeg = require('fluent-ffmpeg');
// Platform agnostic ffmpeg/ffprobe install
const ffmpegPath: string = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const ffprobePath: string = require('@ffprobe-installer/ffprobe').path;
ffmpeg.setFfprobePath(ffprobePath);

function format_seconds(seconds: number) {
    var measuredTime = new Date(null);
    measuredTime.setSeconds(seconds);
    return measuredTime.toISOString().substr(11, 8);
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
};

function cleanup_post_processing(shared_data: SharedDataObject) {
    rmdir(shared_data.folder, (err) => {
        if (err)
            console.log(err);
    });
    console.log("Finished splitting");
};

function split_song(shared_data: SharedDataObject, song: SongObject, meta: MetaDataObject) {
    if (song.duration == 0)
        return null;
    return new Promise((resolve, reject) => {
        ffmpeg(shared_data.raw_path)
            .output(song.filename)
            .seek(format_seconds(song.start))
            .audioBitrate(shared_data.bitrate)
            .audioChannels(2)
            .audioFrequency(shared_data.sample_rate)
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
};

export function process_recording(folder: String) {
    // Read from a shared folder
    let shared_data_path = path.format({
        dir: folder,
        base: "shared_data.json"
    });
    let shared_data: SharedDataObject = JSON.parse(fs.readFileSync(shared_data_path));
    
    let song_list_path = path.format({
        dir: folder,
        base: "song_list.json"
    });
    let song_list: SongObject[] = JSON.parse(fs.readFileSync(song_list_path));
    
    let meta_list_path = path.format({
        dir: folder,
        base: "meta_list.json"
    });
    let meta_list: MetaDataObject[] = JSON.parse(fs.readFileSync(meta_list_path));

    // Handle older recordings
    if (!shared_data.hasOwnProperty("bitrate")) {
        shared_data.bitrate = 192
    }
    if (!shared_data.hasOwnProperty("sample_rate")) {
        shared_data.sample_rate = 44100
    }
    
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
};

export function process(shared_data: SharedDataObject, song_list: SongObject[], meta_list: MetaDataObject[]) {
    // Store song and meta list in case of process failure
    let song_list_path = path.format({
        dir: shared_data.folder,
        base: "song_list.json"
    });
    fs.writeFileSync(song_list_path, JSON.stringify(song_list));
    let meta_list_path = path.format({
        dir: shared_data.folder,
        base: "meta_list.json"
    });
    fs.writeFileSync(meta_list_path, JSON.stringify(meta_list));
    let shared_data_path = path.format({
        dir: shared_data.folder,
        base: "shared_data.json"
    });
    fs.writeFileSync(shared_data_path, JSON.stringify(shared_data));

    process_recording(shared_data.folder);
};