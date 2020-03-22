#!/usr/bin/env node

import * as cli_args from "command-line-args";
import { cli_opts, usage } from "./helpers/cli";
import { load_recording_config } from "./helpers/recording_processor";
import { print } from "./helpers/shared_functions";
import { initial_start } from "./index";

const options = cli_args(cli_opts);

if (options.process) {
  load_recording_config(options.process);
} else if (options.start) {
  const start_options = {
    config: options.config,
    default: options.default_config,
    auto: options.auto_save,
  };
  initial_start(start_options);
} else {
  print(usage);
}
