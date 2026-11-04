import { stagingHandler } from "../src/staging/server";
/** External callers cannot choose their recovery rate-limit identity. The local
 * HTTPS harness alone injects a socket-derived identity; hosted recovery uses
 * the conservative shared limiter until a trusted platform identity is wired. */
export default {
  fetch(request: Request) {
    const headers = new Headers(request.headers);
    headers.delete("X-Azzora-Client-Address");
    return stagingHandler(new Request(request, { headers }));
  },
};
