// Loopback-only HTTPS harness for genuine provider authentication and staging QA.
/* global Request */
import process from "node:process";
import { Buffer } from "node:buffer";
import console from "node:console";
import https from "node:https";
import { readFileSync } from "node:fs";
import { createServer } from "vite";
process.loadEnvFile(".env.staging.local");
process.env.VITE_AZZORA_STAGING = "1";
process.env.AZZORA_STAGING_ALLOWED_ORIGINS =
  "https://127.0.0.1:5361,https://localhost:5361";
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "mpa",
});
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
      const request = new Request(`https://127.0.0.1:5361${req.url}`, {
        method: req.method,
        headers: req.headers,
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
server.listen(5361, "127.0.0.1", () =>
  console.log("Fictional shared staging ready at https://127.0.0.1:5361"),
);
