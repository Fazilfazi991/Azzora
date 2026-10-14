import fs from "node:fs";
const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && fs.existsSync(p));
export const browserOptions = {
  ...(executablePath ? { executablePath } : {}),
  headless: true,
};

// Run each worktree against its own server; browser contexts never reuse a user profile.
export const auditUrl = process.env.AZZORA_URL || "http://127.0.0.1:5173";
