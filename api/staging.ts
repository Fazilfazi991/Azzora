import { stagingHandler } from "../src/staging/server.js";
import { productionCandidate } from "../src/backend/runtime-handler.js";
/** External callers cannot choose their recovery rate-limit identity. The local
 * HTTPS harness alone injects a socket-derived identity; hosted recovery uses
 * the conservative shared limiter until a trusted platform identity is wired. */
export default {
  fetch(request: Request) {
    const headers = new Headers(request.headers);
    headers.delete("X-Azzora-Client-Address");
    const sanitized = new Request(request, { headers });
    // The browser retains the established /api/staging contract. In the
    // dedicated production project it is backed by the canonical production
    // handler, never the fictional staging service.
    return process.env.AZZORA_DEPLOYMENT_MODE === "production-candidate"
      ? productionCandidate(sanitized)
      : stagingHandler(sanitized);
  },
};
