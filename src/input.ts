// acting like a human: find clickable things, real mouse + keyboard input, wait for navigations.
import type { Session } from "./sessions.ts";

export async function html(s: Session): Promise<string> {
  const r = await s.send("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true });
  return r.result.value;
}

// selector -> center of the first match a human could actually click, or a reason why not.
// checks like a human would: does it exist, does it have a size, is something covering it?
export async function locate(s: Session, selector: string): Promise<{ x: number; y: number } | { error: string }> {
  const r = await s.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const all = [...document.querySelectorAll(${JSON.stringify(selector)})];
      if (!all.length) return { error: "nothing matches" };
      const el = all.find((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
      if (!el) return { error: all.length + " match(es), none visible (0x0 or hidden)" };
      el.scrollIntoView({ block: "center", inline: "center" });
      const b = el.getBoundingClientRect();
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      const hit = document.elementFromPoint(x, y);          // what a real click at (x,y) would land on
      if (!hit || !(el === hit || el.contains(hit))) {
        const who = hit ? hit.tagName.toLowerCase() + (hit.id ? "#" + hit.id : "") + (hit.classList[0] ? "." + hit.classList[0] : "") : "nothing";
        return { error: "covered by " + who };
      }
      return { x, y };
    })()`,
  });
  return r.result.value;
}

// a real click = move, press, release. sent as hardware-level input, so the browser marks it trusted.
export async function click(s: Session, x: number, y: number) {
  await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

// a real keypress per character, into whatever element has focus
export async function type(s: Session, text: string) {
  for (const ch of text) {
    await s.send("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch });
    await s.send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
  }
}

// special keys have no text, only identity: key name + physical code + legacy keycode
export const KEYS: Record<string, { code: string; keyCode: number; text?: string; nav?: true }> = {
  Enter: { code: "Enter", keyCode: 13, text: "\r", nav: true },   // nav: can submit a form → worth waiting for
  Tab: { code: "Tab", keyCode: 9 },
  Backspace: { code: "Backspace", keyCode: 8 },
  Escape: { code: "Escape", keyCode: 27 },
  ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
  ArrowUp: { code: "ArrowUp", keyCode: 38 },
  ArrowRight: { code: "ArrowRight", keyCode: 39 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
};

export async function press(s: Session, key: string) {
  const k = KEYS[key];
  const base = { key, code: k.code, windowsVirtualKeyCode: k.keyCode };
  await s.send("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...(k.text && { text: k.text }) });
  await s.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

// run an action; if it kicks off a page load within 500ms, wait for that load to finish
export async function settle<T>(s: Session, act: () => Promise<T>): Promise<T & { navigated: boolean }> {
  const started = s.waitFor("Page.frameStartedLoading", 500).then(() => true, () => false); // listen BEFORE acting
  const loaded = s.waitFor("Page.loadEventFired").catch(() => null);                          // catch: no nav = no load, don't crash
  const r = await act();
  const navigated = await started;
  if (navigated) await loaded;
  return { ...r, navigated };
}
