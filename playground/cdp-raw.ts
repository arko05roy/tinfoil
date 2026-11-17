// raw CDP, no libraries: launch browser, open a WebSocket to a tab, send commands, watch events
import { spawn } from "node:child_process";

const SHELL = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = spawn(SHELL, ["--headless", "--remote-debugging-port=9222", "about:blank"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500)); // lazy: just wait for the port to open

// the "lobby": plain HTTP, gives us the tab's WebSocket address
const [tab] = await (await fetch("http://localhost:9222/json/list")).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));

let nextId = 1;
const send = (method: string, params = {}) => {
  const msg = { id: nextId++, method, params };
  console.log(`>>> CMD  #${msg.id} ${method}`);
  ws.send(JSON.stringify(msg));
};

ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id) {
    // a reply: has the same id as the command we sent
    console.log(`<<< REPLY #${msg.id} ${JSON.stringify(msg.result ?? msg.error).slice(0, 80)}`);
    if (msg.id === 4) { ws.close(); browser.kill(); }
  } else {
    // an event: no id, browser is yelling on its own
    const extra = msg.method === "Network.requestWillBeSent" ? ` ${msg.params.request.url.slice(0, 60)}` : "";
    console.log(`<<< EVENT ${msg.method}${extra}`);
    if (msg.method === "Page.loadEventFired") {
      send("Runtime.evaluate", { expression: "document.querySelectorAll('.quote').length" });
    }
  }
});

send("Page.enable");
send("Network.enable");
send("Page.navigate", { url: "https://quotes.toscrape.com/js/" });
