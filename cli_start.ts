#!/usr/bin/env node

import { cli_opts, usage } from "./helpers/cli";
import { process_recording } from "./helpers/recording_processor";
import { print } from "./helpers/shared_functions";
import { initial_start } from "./index";

const cli_args = require("command-line-args");

const options = cli_args(cli_opts);

if (options.process) {
  process_recording(options.process);
} else if (options.start) {
  initial_start(options.config);
} else {
  print(usage);
}
