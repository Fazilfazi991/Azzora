// Local-only acceptance harness. Production continues to use private Vercel Blob.
// Serve an Accounts-only dist build and the REAL hosted handler over local TLS.
// Generate a self-signed cert/key into ignored tmp/ and provide paths via env.
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, scryptSync, createHash } from "node:crypto";
import { createServer } from "vite";

const root = path.resolve(process.env.AZZORA_PREVIEW_TEST_DIST || "dist"),
  storage = path.resolve("tmp/accounts-preview-store");
const secretPath = path.resolve("tmp/accounts-preview-access.json");
const port = Number(process.env.AZZORA_PREVIEW_TEST_PORT || 5293);
if (
  !process.env.AZZORA_PREVIEW_TEST_CERT ||
  !process.env.AZZORA_PREVIEW_TEST_KEY
)
  throw Error("Local TLS certificate and key paths are required.");
if (fs.existsSync(path.join(root, "index.html")))
  throw Error(
    "Build with AZZORA_ACCOUNTS_PREVIEW=1 first; Manager entry must be absent.",
  );
fs.mkdirSync(storage, { recursive: true });
if (!fs.existsSync(secretPath)) {
  const password = randomBytes(24).toString("base64url"),
    salt = randomBytes(16).toString("hex");
  fs.writeFileSync(
    secretPath,
    JSON.stringify({
      password,
      passwordHash: `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
    }),
    { flag: "wx", mode: 0o600 },
  );
}
const secret = JSON.parse(fs.readFileSync(secretPath, "utf8"));
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
const { createHostedHandler } = await vite.ssrLoadModule(
  "/src/accounts-review/hosted.ts",
);
const { ReviewConflict, encodeReview, decodeReview } = await vite.ssrLoadModule(
  "/src/accounts-review/hosted-store.ts",
);
const storePath = (key) =>
  path.join(storage, createHash("sha256").update(key).digest("hex") + ".json");
const store = {
  async read(key) {
    const file = storePath(key);
    return fs.existsSync(file)
      ? decodeReview(fs.readFileSync(file, "utf8"))
      : null;
  },
  async write(key, value, version) {
    const file = storePath(key),
      old = fs.existsSync(file)
        ? decodeReview(fs.readFileSync(file, "utf8"))
        : null;
    if (old ? old.version !== version : Boolean(version))
      throw new ReviewConflict("Concurrent local test write.");
    const temp = file + ".tmp";
    fs.writeFileSync(temp, encodeReview({ value, version: randomUUID() }), {
      mode: 0o600,
    });
    fs.renameSync(temp, file);
  },
  async remove(key, version) {
    const file = storePath(key),
      old = fs.existsSync(file)
        ? decodeReview(fs.readFileSync(file, "utf8"))
        : null;
    if (old?.version !== version)
      throw new ReviewConflict("Concurrent local test delete.");
    fs.unlinkSync(file);
  },
};
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
};
const server = https.createServer(
  {
    cert: fs.readFileSync(process.env.AZZORA_PREVIEW_TEST_CERT),
    key: fs.readFileSync(process.env.AZZORA_PREVIEW_TEST_KEY),
  },
  async (req, res) => {
    try {
      if (req.headers.host !== `127.0.0.1:${port}`) {
        res.writeHead(403);
        res.end();
        return;
      }
      const url = new URL(req.url, `https://127.0.0.1:${port}`);
      if (url.pathname.startsWith("/api/accounts-review")) {
        const buffers = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 2_900_000) {
            res.writeHead(413);
            res.end();
            return;
          }
          buffers.push(chunk);
        }
        // Construct a fresh handler for every request: no process-memory session shortcut.
        const response = await createHostedHandler(
          store,
          () => secret.passwordHash,
        )(
          new Request(url, {
            method: req.method,
            headers: req.headers,
            ...(["GET", "HEAD"].includes(req.method)
              ? {}
              : { body: Buffer.concat(buffers) }),
          }),
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const file = path.resolve(
        root,
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/accountant.html" : url.pathname,
          ),
      );
      if (
        !file.startsWith(root + path.sep) ||
        !fs.existsSync(file) ||
        !fs.statSync(file).isFile()
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(file).pipe(res);
    } catch {
      res.writeHead(500);
      res.end("Local acceptance harness failure.");
    }
  },
);
server.listen(port, "127.0.0.1", () =>
  console.log(
    `LOCAL test harness https://127.0.0.1:${port}/accountant.html · access note in ignored tmp/accounts-preview-access.json · not deployed`,
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    server.close();
    await vite.close();
    process.exit();
  });
