// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// Loopback-only client-review API. No CRM browser record is read or imported.
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { applyReviewAction, createReviewState, reviewSnapshot } from "./domain";

const email = "accountant@review.azzora.test";
const configuredPassword = process.env.AZZORA_REVIEW_PASSWORD || "";
const salt = randomBytes(32);
const passwordHash = scryptSync(configuredPassword, salt, 64);
const sessions = new Map();
const attempts = new Map();
const actionResults = new Map();
let finance = createReviewState();
const asOf = "2026-10-22";
const cookieName = "azzora_review_session";

function json(res, status, body, extra = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
  res.end(JSON.stringify(body));
}
async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_900_000) throw Error("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function session(req) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`));
  const token = cookie?.slice(cookieName.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  const key = createHash("sha256").update(token).digest("hex");
  const found = sessions.get(key);
  if (!found) return undefined;
  const now = Date.now();
  if (found.expires < now || found.absolute < now) {
    sessions.delete(key);
    return undefined;
  }
  found.expires = now + 20 * 60_000;
  return { key, ...found };
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  return typeof origin === "string" && origin === `http://${req.headers.host}`;
}
function checkPassword(value) {
  const candidate = scryptSync(
    typeof value === "string" ? value : "",
    salt,
    64,
  );
  return timingSafeEqual(candidate, passwordHash);
}

export function accountsReviewPlugin() {
  return {
    name: "azzora-local-accounts-review",
    apply: "serve" as const,
    configureServer(server) {
      server.middlewares.use("/api/accounts-review", async (req, res) => {
        try {
          if (
            !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
              req.socket.remoteAddress,
            )
          )
            return json(res, 403, { error: "Loopback access only." });
          if (!configuredPassword || configuredPassword.length < 16)
            return json(res, 503, {
              error:
                "Set AZZORA_REVIEW_PASSWORD (at least 16 characters) before starting the local review.",
            });
          const path = new URL(req.url || "/", "http://localhost").pathname;
          if (req.method === "POST" && !sameOrigin(req))
            return json(res, 403, { error: "Origin check failed." });
          if (path === "/login" && req.method === "POST") {
            const ip = req.socket.remoteAddress;
            const prior = attempts.get(ip) || { count: 0, until: 0 };
            if (prior.until > Date.now())
              return json(res, 429, {
                error: "Too many sign-in attempts. Try again later.",
              });
            const input = await body(req);
            if (input.email !== email || !checkPassword(input.password)) {
              const count = prior.count + 1;
              attempts.set(ip, {
                count,
                until: count >= 5 ? Date.now() + 60_000 : 0,
              });
              return json(res, 401, {
                error: "Invalid Accountant credentials.",
              });
            }
            attempts.delete(ip);
            const token = randomBytes(32).toString("hex");
            const key = createHash("sha256").update(token).digest("hex");
            const csrf = randomBytes(32).toString("hex");
            sessions.set(key, {
              role: "accountant",
              csrf,
              expires: Date.now() + 20 * 60_000,
              absolute: Date.now() + 8 * 60 * 60_000,
            });
            return json(
              res,
              200,
              {
                email,
                role: "accountant",
                csrf,
                mode: "fictional-local-review",
              },
              {
                "Set-Cookie": `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/api/accounts-review; Max-Age=28800`,
              },
            );
          }
          const active = session(req);
          if (!active)
            return json(res, 401, {
              error: "Sign in to the Accountant review workspace.",
            });
          if (active.role !== "accountant")
            return json(res, 403, { error: "Accountant access required." });
          if (path === "/session" && req.method === "GET")
            return json(res, 200, {
              email,
              role: active.role,
              csrf: active.csrf,
              mode: "fictional-local-review",
            });
          if (
            req.method === "POST" &&
            req.headers["x-azzora-csrf"] !== active.csrf
          )
            return json(res, 403, { error: "Session verification failed." });
          if (path === "/logout" && req.method === "POST") {
            sessions.delete(active.key);
            return json(
              res,
              200,
              { ok: true },
              {
                "Set-Cookie": `${cookieName}=; HttpOnly; SameSite=Strict; Path=/api/accounts-review; Max-Age=0`,
              },
            );
          }
          if (path === "/reset" && req.method === "POST") {
            finance = createReviewState();
            actionResults.clear();
            return json(res, 200, {
              ok: true,
              snapshot: reviewSnapshot(finance, asOf),
            });
          }
          if (path === "/snapshot" && req.method === "GET")
            return json(res, 200, reviewSnapshot(finance, asOf));
          if (path.startsWith("/attachment/") && req.method === "GET") {
            const id = decodeURIComponent(path.slice("/attachment/".length));
            const file = finance.attachments.find((item) => item.id === id);
            if (!file)
              return json(res, 404, { error: "Attachment not found." });
            const bytes = Buffer.from(file.data, "base64");
            res.writeHead(200, {
              "Content-Type": file.mime,
              "Content-Length": bytes.length,
              "Content-Disposition": `attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            });
            return res.end(bytes);
          }
          if (path === "/action" && req.method === "POST") {
            const key = req.headers["x-azzora-idempotency-key"];
            if (typeof key !== "string" || !/^[0-9a-f-]{36}$/i.test(key))
              return json(res, 400, {
                error: "A unique action key is required.",
              });
            const action = await body(req);
            if (
              !action ||
              typeof action !== "object" ||
              ![
                "invoice",
                "issue-invoice",
                "bill",
                "receipt",
                "supplier-payment",
                "expense",
              ].includes(action.kind)
            )
              return json(res, 400, { error: "Unknown finance action." });
            const fingerprint = createHash("sha256")
              .update(JSON.stringify(action))
              .digest("hex");
            const prior = actionResults.get(key);
            if (prior)
              return prior.fingerprint === fingerprint
                ? json(res, 200, {
                    id: prior.id,
                    snapshot: reviewSnapshot(finance, asOf),
                  })
                : json(res, 409, {
                    error: "Action key was reused with different details.",
                  });
            const id =
              action.kind === "issue-invoice"
                ? action.id
                : `DEMO-${randomUUID().slice(0, 8).toUpperCase()}`;
            const next = applyReviewAction(finance, { ...action, id });
            reviewSnapshot(next, asOf); // Reconcile before committing the in-memory transaction.
            finance = next;
            const result = { id, snapshot: reviewSnapshot(finance, asOf) };
            actionResults.set(key, { fingerprint, id });
            return json(res, 200, result);
          }
          return json(res, 404, {
            error: "Accountant review endpoint not found.",
          });
        } catch (error) {
          return json(res, 400, {
            error: error instanceof Error ? error.message : "Request failed.",
          });
        }
      });
    },
  };
}
