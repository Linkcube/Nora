import * as rp from "request-promise";

export function resolve_after_get(x: string) {
  return rp(x).then((result: string) => {
    return JSON.parse(result);
  });
}

export function format_seconds(seconds: number) {
  const measuredTime = new Date(0);
  measuredTime.setSeconds(seconds);
  return measuredTime.toISOString().substr(11, 8);
}

export function print(msg: any) {
  console.log(msg);
}
