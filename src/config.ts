// every knob in one place. all overridable by env var.
import { join } from "node:path";

const env = (k: string, d: number) => Number(process.env[k] ?? d);

export const CHROME = process.env.CHROME ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
export const PORT = env("PORT", 4000);
export const PROFILES = join(import.meta.dirname, "..", "profiles");

// the tub, not the tap: cap how many chromes exist + drain abandoned ones
export const MAX_SESSIONS = env("MAX_SESSIONS", 20);
export const IDLE_MS = env("IDLE_MS", 5 * 60_000);          // quiet this long → dead
export const MAX_LIFE_MS = env("MAX_LIFE_MS", 30 * 60_000); // hard ceiling, even if busy
