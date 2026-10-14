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
export function resolveAuditUrl(env = process.env) {
  const values = ["AZZORA_URL", "AZZORA_TEST_URL", "QUOTATION_URL"]
    .filter((key) => env[key])
    .map((key) => {
      const parsed = new URL(env[key]);
      if (!/^https?:$/.test(parsed.protocol) || parsed.hash || parsed.search)
        throw Error(
          `${key} must be an HTTP(S) base URL without query or hash.`,
        );
      return parsed.href.replace(/\/+$/, "");
    });
  if (new Set(values).size > 1)
    throw Error(
      "AZZORA_URL, AZZORA_TEST_URL and QUOTATION_URL disagree; select one isolated server.",
    );
  return values[0] || "http://127.0.0.1:5173";
}
export const auditUrl = resolveAuditUrl();
