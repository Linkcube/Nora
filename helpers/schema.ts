const { buildSchema } = require('graphql');

export let Schema = buildSchema(`
    type Query {
        api: api_obj
        server: server_obj
        valid: is_valid
        misc: misc_data
        config: config_data
        past_recordings: all_recordings
        recording_cover(folder: String!): cover_data
        full_recording(folder: String!): full_recording_data
    },
    type Mutation {
        updateConfig(config: new_config): String
        printLog(msg: String): String
        streamAction(action: String): String
    }
    type api_obj {
        np: String
        listeners: Int
        dj_name: String
        dj_pic: String
        start_time: String
        end_time: String
        current_time: String
        lp: [lp_song]
    },
    type server_obj {
        bitrate: Int
        sample_rate: Int
        audio_format: String
        server_name: String
        server_description: String
    },
    type is_valid {
        valid_dj: Boolean
        force_stop: Boolean
    }
    type misc_data {
        dj_image_link: String
        rec_start: Int
    }
    type lp_song {
        meta: String
        time: String
        type: Int
        timestamp: Int
    }
    type config_data {
        api_uri: String
        server_uri: String
        stream_uri: String
        poll_interval: Int
        excluded_djs: [String]
        export_folder: String
    }
    type all_recordings {
        recordings: [recordings_data]
    }
    type recordings_data {
        folder: String
        songs: Int
        cover: String
    }
    type cover_data {
        cover: String
    }
    type full_recording_data {
        songs: [song_data]
    }
    type song_data {
        title: String
        artist: String
        file: String
    }
    input new_config {
        api_uri: String
        server_uri: String
        stream_uri: String
        poll_interval: Int
        excluded_djs: [String]
        export_folder: String
    }
`);