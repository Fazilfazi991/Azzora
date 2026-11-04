// Loopback-only HTTPS harness for genuine provider authentication and staging QA.
/* global Request, Headers */
import process from "node:process";
import { Buffer } from "node:buffer";
import console from "node:console";
import https from "node:https";
import { readFileSync } from "node:fs";
import { createServer } from "vite";
process.loadEnvFile(".env.staging.local");
process.env.VITE_AZZORA_STAGING = "1";
const port = Number(process.env.AZZORA_STAGING_PORT || 5365);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw Error("Invalid loopback port");
process.env.AZZORA_STAGING_ALLOWED_ORIGINS = `https://127.0.0.1:${port},https://localhost:${port}`;
let vite;
const certificateRoot =
  "../azzora-accounts-deepseek/tmp/deepseek-verification/";
const server = https.createServer(
  {
    key: readFileSync(certificateRoot + "test-key.pem"),
    cert: readFileSync(certificateRoot + "test-cert.pem"),
  },
  async (req, res) => {
    if (!req.url?.startsWith("/api/staging")) return vite.middlewares(req, res);
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2_900_000) {
          res.writeHead(413);
          return res.end();
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const headers = new Headers(
        Object.fromEntries(
          Object.entries(req.headers)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)]),
        ),
      );
      headers.set(
        "X-Azzora-Client-Address",
        req.socket.remoteAddress || "loopback",
      );
      const request = new Request(`https://127.0.0.1:${port}${req.url}`, {
        method: req.method,
        headers,
        ...(!["GET", "HEAD"].includes(req.method) ? { body } : {}),
      });
      const module = await vite.ssrLoadModule("/src/staging/server.ts");
      const response = await module.stagingHandler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Staging service unavailable." }));
    }
  },
);
vite=await createServer({cacheDir:"tmp/staging-vite-cache",server:{middlewareMode:true,hmr:{server}},appType:"mpa"});
server.listen(port, "127.0.0.1", () =>
  console.log(`Fictional shared staging ready at https://127.0.0.1:${port}`),
);
