export interface IServerObject {
  bitrate: number;
  sample_rate: number;
  audio_format: string;
  server_name: string;
  server_description: string;
}

export interface IApiObject {
  np: string;
  listeners: number;
  dj_name: string;
  dj_pic: string;
  start_time: number;
  end_time: number;
  current_time: number;
  lp: [];
}

export interface ISongObject {
  start: number;
  filename: string;
  dj: string;
  cover: string;
  album: string;
  duration?: number;
}

export interface IMetaDataObject {
  song_name: string;
  artist: string;
  location: string;
  track: number;
}

export interface ISharedDataObject {
  date: number;
  raw_path: string;
  folder: string;
  bitrate: number;
  sample_rate: number;
}

export interface IUpdateDataObject {
  config: IUpdateConfigObject;
}

interface IUpdateConfigObject {
  api_uri: string;
  server_uri: string;
  stream_uri: string;
  poll_interval: number;
  excluded_djs: string[];
  export_folder: string;
}

export interface IPastRecording {
  folder: string;
  songs: number;
  cover: string | null;
}

export interface IRecordedSong {
  title: string;
  artist: string;
  file: string;
}
