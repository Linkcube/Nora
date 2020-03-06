import * as rp from "request-promise";
const winston = require("winston");

const noraLogger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "info.log", level: "info" }),
  ],
});

export function resolve_after_get(x: string) {
  return rp(x)
    .then((result: string) => {
      return JSON.parse(result);
    })
    .catch((err: Error) => log_error(err));
}

export function format_seconds(seconds: number) {
  const measuredTime = new Date(0);
  measuredTime.setSeconds(seconds);
  return measuredTime.toISOString().substr(11, 8);
}

export function print(msg: any) {
  console.log(msg);
  noraLogger.info(msg);
}

export function log_error(err: Error) {
  console.log(`Hit error: ${err.name}! Full message in error.log`);
  noraLogger.error(err.message);
  noraLogger.error(err.stack);
}
