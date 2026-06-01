import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const STATE_DIR = path.join(homedir(), ".composer", "state");
const ONBOARDING_FILE = path.join(STATE_DIR, "onboarding.json");

/**
 * Whether the full first-run welcome has already been shown. Stored as a small
 * JSON marker under ~/.composer/state so returning users get the compact splash
 * instead. Best-effort: any read error is treated as "not seen yet".
 */
export function hasSeenOnboarding(): boolean {
  try {
    const parsed = JSON.parse(readFileSync(ONBOARDING_FILE, "utf8")) as {
      seen?: unknown;
    };
    return parsed.seen === true;
  } catch {
    return false;
  }
}

/** Record that the welcome has been shown (best effort — never throws). */
export function markOnboardingSeen(): void {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(
      ONBOARDING_FILE,
      `${JSON.stringify({ seen: true, at: Date.now() })}\n`,
      "utf8"
    );
  } catch {
    // Onboarding state is best-effort; never break the TUI on an I/O failure.
  }
}
