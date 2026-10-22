import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  applyReviewAction,
  createReviewState,
  reviewSnapshot,
  type ReviewAction,
  type ReviewState,
} from "./domain.js";
import { ReviewConflict, type ReviewStore } from "./hosted-store.js";
import { reviewPdf } from "./pdf.js";
import { extractDocument } from "./documents/service.js";
import { ZodError } from "zod";

interface HostedSession {
  role: "accountant";
  csrf: string;
  expires: number;
  finance: ReviewState;
  actions: Record<string, { fingerprint: string; id: string }>;
}
const email = "accountant@review.azzora.test";
const cookieName = "__Host-azzora_accounts_review";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const json = (status: number, value: unknown, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
async function readInput(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw Error("JSON content is required.");
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > 2_900_000)
    throw Error("Request exceeds the demo upload limit.");
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createHostedHandler(
  store: ReviewStore,
  passwordHash: () => string | undefined,
) {
  return async (request: Request): Promise<Response> => {
    try {
      const configured = passwordHash() || "";
      if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(configured))
        return json(503, {
          error: "The protected review login is not configured.",
        });
      const url = new URL(request.url);
      const path =
        "/" +
        (
          url.searchParams.get("route") ||
          url.pathname.replace(/^\/api\/accounts-review\/?/, "")
        ).replace(/^\/+/, "");
      if (url.protocol !== "https:")
        return json(403, { error: "HTTPS is required." });
      if (!["GET", "POST"].includes(request.method))
        return json(
          405,
          { error: "Method not allowed." },
          { Allow: "GET, POST" },
        );
      if (
        request.method === "POST" &&
        request.headers.get("origin") !== url.origin
      )
        return json(403, { error: "Origin check failed." });
      if (path === "/login" && request.method === "POST") {
        const input = await readInput(request);
        const bucket = Math.floor(Date.now() / 300_000);
        const ratePath = `attempts/${hash(`${request.headers.get("x-forwarded-for") || "review"}:${bucket}`)}.json`;
        const rate = await store.read<{ count: number }>(ratePath);
        if ((rate?.value.count || 0) >= 5)
          return json(429, {
            error: "Too many sign-in attempts. Retry in five minutes.",
          });
        const [salt, expected] = configured.split(":");
        const candidate = scryptSync(
          typeof input.password === "string" && input.password.length <= 256
            ? input.password
            : "",
          salt,
          64,
        );
        if (
          input.email !== email ||
          !timingSafeEqual(candidate, Buffer.from(expected, "hex"))
        ) {
          await store.write(
            ratePath,
            { count: (rate?.value.count || 0) + 1 },
            rate?.version,
          );
          return json(401, { error: "Invalid Accountant credentials." });
        }
        const token = randomBytes(32).toString("hex");
        const session: HostedSession = {
          role: "accountant",
          csrf: randomBytes(32).toString("hex"),
          expires: Date.now() + 8 * 60 * 60_000,
          finance: createReviewState(),
          actions: {},
        };
        await store.write(`sessions/${hash(token)}.json`, session);
        return json(
          200,
          {
            email,
            role: session.role,
            csrf: session.csrf,
            mode: "fictional-hosted-review",
          },
          {
            "Set-Cookie": `${cookieName}=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,
          },
        );
      }
      const token = request.headers
        .get("cookie")
        ?.split(";")
        .map((value) => value.trim())
        .find((value) => value.startsWith(`${cookieName}=`))
        ?.slice(cookieName.length + 1);
      if (!token || !/^[a-f0-9]{64}$/.test(token))
        return json(401, {
          error: "Sign in to the Accountant review workspace.",
        });
      const sessionPath = `sessions/${hash(token)}.json`;
      const stored = await store.read<HostedSession>(sessionPath);
      if (!stored || stored.value.expires < Date.now())
        return json(401, {
          error: "The review session has expired. Sign in again.",
        });
      const active = stored.value;
      if (active.role !== "accountant")
        return json(403, { error: "Accountant access required." });
      if (
        request.method === "POST" &&
        request.headers.get("x-azzora-csrf") !== active.csrf
      )
        return json(403, { error: "Session verification failed." });
      if (path === "/session" && request.method === "GET")
        return json(200, {
          email,
          role: active.role,
          csrf: active.csrf,
          mode: "fictional-hosted-review",
        });
      if (path === "/logout" && request.method === "POST") {
        await store.remove(sessionPath, stored.version);
        return json(
          200,
          { ok: true },
          {
            "Set-Cookie": `${cookieName}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
          },
        );
      }
      if (path === "/snapshot" && request.method === "GET")
        return json(200, reviewSnapshot(active.finance));
      if (path === "/documents/extract" && request.method === "POST") {
        const input = await readInput(request);
        const result = await extractDocument(active.finance, input.file);
        active.finance = result.state;
        if (!result.reused)
          await store.write(sessionPath, active, stored.version);
        return json(200, {
          id: result.id,
          reused: result.reused,
          snapshot: reviewSnapshot(active.finance),
        });
      }
      if (path === "/reset" && request.method === "POST") {
        active.finance = createReviewState();
        active.actions = {};
        await store.write(sessionPath, active, stored.version);
        return json(200, {
          ok: true,
          snapshot: reviewSnapshot(active.finance),
        });
      }
      if (path.startsWith("/attachment/") && request.method === "GET") {
        const id = decodeURIComponent(path.slice(12));
        const file = active.finance.attachments.find((item) => item.id === id);
        if (!file)
          return json(404, {
            error: "Attachment not found in this review session.",
          });
        return new Response(Buffer.from(file.data, "base64"), {
          headers: {
            "Content-Type": file.mime,
            "Content-Disposition": `attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
            "Cache-Control": "no-store, private",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (path.startsWith("/pdf/") && request.method === "GET") {
        const name = decodeURIComponent(path.slice(5));
        const pdf = reviewPdf(active.finance, name);
        return new Response(pdf, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="AZZORA-demo-${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf"`,
            "Cache-Control": "no-store, private",
          },
        });
      }
      if (path === "/action" && request.method === "POST") {
        const key = request.headers.get("x-azzora-idempotency-key");
        if (!key || !/^[a-f0-9-]{36}$/i.test(key))
          return json(400, { error: "A unique action key is required." });
        const action = await readInput(request);
        if (
          !action ||
          ![
            "invoice",
            "issue-invoice",
            "bill",
            "receipt",
            "supplier-payment",
            "expense",
            "document-draft",
          ].includes(action.kind)
        )
          return json(400, { error: "Unknown finance action." });
        const fingerprint = hash(JSON.stringify(action));
        const prior = active.actions[key];
        if (prior)
          return prior.fingerprint === fingerprint
            ? json(200, {
                id: prior.id,
                snapshot: reviewSnapshot(active.finance),
              })
            : json(409, {
                error: "Action key was reused with different details.",
              });
        if (Object.keys(active.actions).length >= 100)
          return json(400, {
            error:
              "This review session has reached 100 actions. Start a new demo session.",
          });
        const invoicePrefix =
          action.kind === "invoice"
            ? action.invoiceType === "Normal Invoice"
              ? "NOR"
              : action.invoiceType === "Proforma"
                ? "PRO"
                : "INV"
            : "DEMO";
        const id =
          action.kind === "issue-invoice"
            ? action.id
            : `${invoicePrefix}-26${randomUUID().slice(0, 6).toUpperCase()}`;
        active.finance = applyReviewAction(active.finance, {
          ...action,
          id,
        } as ReviewAction);
        if (
          active.finance.attachments.reduce((sum, file) => sum + file.size, 0) >
          6_000_000
        )
          return json(400, {
            error: "This demo session supports up to 6 MB of attachments.",
          });
        const snapshot = reviewSnapshot(active.finance);
        active.actions[key] = { fingerprint, id };
        await store.write(sessionPath, active, stored.version);
        return json(200, { id, snapshot });
      }
      return json(404, { error: "Review endpoint not found." });
    } catch (error) {
      if (error instanceof ZodError)
        return json(400, {
          error:
            "Check document fields: " +
            error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")
              .slice(0, 600),
        });
      if (error instanceof ReviewConflict)
        return json(409, { error: error.message });
      if (
        error instanceof Error &&
        /required|amount|date|exceeds|allocation|file|upload|draft|document|JSON|Unexpected|Choose|Enter|match|already|Only/i.test(
          error.message,
        )
      )
        return json(400, { error: error.message });
      console.error(
        "accounts-review-request-failed",
        error instanceof Error ? error.name : "unknown",
      );
      return json(503, {
        error: "The review service is temporarily unavailable. Please retry.",
      });
    }
  };
}
