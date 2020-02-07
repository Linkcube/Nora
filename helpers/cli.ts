import * as commandLineUsage from "command-line-usage";

const sections = [
  {
    header: "Nora",
    content:
      "Node R/a/dio archiver, for saving your streams. For a gui check out: {underline https://github.com/Linkcube/svelte-radio-interface}",
  },
  {
    header: "Options",
    optionList: [
      {
        name: "config",
        alias: "c",
        typeLabel: "{underline file}",
        description: "Loads a JSON config file for the main program, use with --start.",
      },
      {
        name: "default_config",
        alias: "d",
        type: Boolean,
        description: "If no config file is provided/found, generate a config file using default values.",
      },
      {
        name: "auto_save",
        alias: "a",
        type: Boolean,
        description: "Save changes made in the gui to the config file.",
      },
      {
        name: "start",
        alias: "s",
        type: Boolean,
        description: "Starts the main program.",
      },
      {
        name: "process",
        alias: "p",
        typeLabel: "{underline file}",
        description: "Process a previous recording.",
      },
    ],
  },
  {
    content: "Project home: {underline https://github.com/Linkcube/Nora}",
  },
];

export const usage = commandLineUsage(sections);

export const cli_opts = [
  { name: "config", alias: "c", type: String },
  { name: "default_config", alias: "d", type: Boolean },
  { name: "auto_save", alias: "a", type: Boolean },
  { name: "start", alias: "s", type: Boolean },
  { name: "process", alias: "p", type: String },
  { name: "help", alias: "h", type: Boolean },
];
