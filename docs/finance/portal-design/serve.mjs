import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png" };
const port = Number(process.env.PORT || 5299);

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) throw new Error("Path outside prototype root");
    if (!(await stat(file)).isFile()) throw new Error("Not a file");
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`AZZORA Accounts design preview: http://127.0.0.1:${port}/docs/finance/portal-design/index.html`);
});
