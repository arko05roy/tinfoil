// one-line structured logs: easy to read in a terminal, easy to grep/ship later.
type Fields = Record<string, unknown>;
const fmt = (f: Fields) => Object.entries(f).map(([k, v]) => `${k}=${typeof v === "string" && v.includes(" ") ? JSON.stringify(v) : v}`).join(" ");
const out = (level: string, msg: string, f: Fields = {}) =>
  (level === "error" ? console.error : console.log)(`${new Date().toISOString()} ${level.padEnd(5)} ${msg}${Object.keys(f).length ? " " + fmt(f) : ""}`);

export const log = {
  info: (msg: string, f?: Fields) => out("info", msg, f),
  warn: (msg: string, f?: Fields) => out("warn", msg, f),
  error: (msg: string, f?: Fields) => out("error", msg, f),
};
