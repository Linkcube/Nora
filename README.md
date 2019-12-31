# Nora
NodeJS R/a/dio Archiver

Made to poll r-a-d.io until a human DJ comes online, and to begin recording their stream. Unlike other npm radio downloaders, this one will split based on the name and tag the stream as an album using the DJ's name and timestamp. This has been specially tailored for the setup that r/a/dio uses so it will probably not work with other internet radio streams.

## Usage
cd to the directory you've placed this repo.

Install: `npm install`

Running: `ts-node nora.ts`

Mac users may have to include `npx` before the ts-node command

## Basic Control Endpoints
Stop recording: `http://localhost:8080/stop`

Restart recording: `http://localhost:8080/refresh`

Start recording (from a stopped state): `http://localhost:8080/start`

## Editable Variables
Description | Type | Example
--- | --- | ---
Poll Interval (poll_interval) | Integer (ms) | `poll_interval = 5000`
Exluded DJs | [String] | `excluded_djs = ["Hanyuu-sama"]`
Export Folder | String | `export_folder = "."`

## CLI args
Usage (shorthand) | Description | Example
--- | --- | ---
--load_config (-l) | Load a config file | `-l radio.json`

[Nai](https://github.com/linkcube/nai), the complimenting UI to this project manages many of the safe value changes so there's no real need to mess around with them.
