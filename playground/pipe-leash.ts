// CDP over a pipe instead of a port: does the browser die when its parent does?
import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";

const SHELL = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

// stdio slots: 0 stdin, 1 stdout, 2 stderr, 3 = commands INTO chrome, 4 = replies OUT of chrome
const browser = spawn(SHELL, ["--headless", "--remote-debugging-pipe", "about:blank"], {
  stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
});
const toChrome = browser.stdio[3] as Writable;
const fromChrome = browser.stdio[4] as Readable;
console.log(`parent pid ${process.pid}, browser pid ${browser.pid}`);

// over a pipe there are no WebSocket frames, so each JSON message ends with a \0 byte
let buf = "";
fromChrome.on("data", (chunk) => {
  buf += chunk;
  let end;
  while ((end = buf.indexOf("\0")) >= 0) {
    console.log("<<<", buf.slice(0, end).slice(0, 100));
    buf = buf.slice(end + 1);
  }
});

toChrome.write(JSON.stringify({ id: 1, method: "Browser.getVersion" }) + "\0");
setInterval(() => {}, 1000); // stay alive until someone murders us
