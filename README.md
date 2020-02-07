# Nora
NodeJS R/a/dio Archiver

Made to poll r-a-d.io until a human DJ comes online, and to begin recording their stream. Unlike other npm radio downloaders, this one will split based on the name and tag the stream as an album using the DJ's name and timestamp. This has been specially tailored for the setup that r/a/dio uses so it will probably not work with other internet radio streams.

## Usage
Install: `npm install linkcube-nora`

Running: `npx linkcube-nora --start`

Use the `--help` flag for more options.

## Editable Variables
Description | Type | Example
--- | --- | ---
Poll Interval (poll_interval) | Integer (ms) | `poll_interval = 5000`
Exluded DJs | [String] | `excluded_djs = ["Hanyuu-sama"]`
Export Folder | String | `export_folder = "."`

## CLI args
Usage (shorthand) | Description | Example
--- | --- | ---
--config (-c) | Load a config file | `-c radio.json`
--default_config (-d) | If no config file is provided/found, generate a config file using default values | `-d`
--auto_save (-a) | Save changes made in the gui to the config file | `-a`
--process (-p) | Process a previous recording | `-p my_recording`
--start (-s) | Start the main program | `-s`

When using `--config`, it must be used in conjunction with `--start`, i.e `ts-node nora.ts -c config.json --start`

svelte-radio-interface, the complimenting UI to this project manages many of the safe value changes so there's no real need to mess around with them directly.

## Links
svelte-radio-interface: [github](https://github.com/Linkcube/svelte-radio-interface) [npm](https://www.npmjs.com/package/svelte-radio-interface)

Nora: [github](https://github.com/Linkcube/Nora) [npm](https://www.npmjs.com/package/linkcube-nora)
