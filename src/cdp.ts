// CDP client over a pipe: commands matched by id, events matched by name.
// a pipe is a raw byte stream, so every JSON message ends with a \0 byte.
import type { Readable, Writable } from "node:stream";

export type CDP = ReturnType<typeof connectCDP>;

export function connectCDP(toChrome: Writable, fromChrome: Readable) {
  let nextId = 1;
  const pending = new Map<number, { ok: (v: any) => void; fail: (e: Error) => void }>(); // commands waiting for a reply
  const waiters: { event: string; sessionId?: string; ok: (v: any) => void }[] = [];     // code waiting for an event

  const onMessage = (msg: any) => {
    if (msg.id) {                                   // reply to one of our commands
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p?.fail(new Error(msg.error.message)); else p?.ok(msg.result);
    } else {                                        // event the browser yelled on its own
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        if (w.event === msg.method && w.sessionId === msg.sessionId) { w.ok(msg.params); waiters.splice(i, 1); }
      }
    }
  };

  let buf = "";
  fromChrome.on("data", (chunk) => {
    buf += chunk;
    let end;
    while ((end = buf.indexOf("\0")) >= 0) {        // may get half a message, or three at once
      onMessage(JSON.parse(buf.slice(0, end)));
      buf = buf.slice(end + 1);
    }
  });

  // sessionId = which target (tab) the message is for. none = the browser itself.
  const send = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<any>((ok, fail) => {
      const id = nextId++;
      pending.set(id, { ok, fail });
      toChrome.write(JSON.stringify({ id, method, params, sessionId }) + "\0");
    });

  const waitFor = (event: string, sessionId?: string, ms = 30_000) =>
    new Promise<any>((ok, fail) => {
      const w = { event, sessionId, ok };
      waiters.push(w);
      setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) { waiters.splice(i, 1); fail(new Error(`timed out waiting for ${event}`)); }
      }, ms);
    });

  return { send, waitFor };
}
