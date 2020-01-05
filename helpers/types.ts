
export interface ServerObject {
    bitrate: number,
    sample_rate: number,
    audio_format: string,
    server_name: string,
    server_description: string
};

export interface ApiObject {
    np: string,
    listeners: number,
    dj_name: string,
    dj_pic: string,
    start_time: number,
    end_time: number,
    current_time: number,
    lp: [],
};

export interface SongObject {
    start: number,
    filename: string,
    dj: string,
    cover: string,
    album: string,
    duration?: number
};

export interface MetaDataObject {
    song_name: string,
    artist: string,
    location: string,
    track: number,
};

export interface SharedDataObject {
    date: number,
    raw_path: string,
    folder: string,
    bitrate: number,
    sample_rate: number
};

export interface UpdateDataObject {
    config: UpdateConfigObject
};

interface UpdateConfigObject {
    api_uri: string,
    server_uri: string,
    stream_uri: string,
    poll_interval: number,
    excluded_djs: string[],
    export_folder: string
};