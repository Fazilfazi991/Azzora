import { productionCandidate } from "../src/backend/runtime-handler.js";
import { productionCredentialSetup } from "../src/backend/production-credential-setup.js";
export default {
  fetch(request: Request) {
    const headers = new Headers(request.headers);
    headers.delete("X-Azzora-Client-Address");
    const clean = new Request(request, { headers });
    const target = new URL(request.url);
    const route =
      target.searchParams.get("route") ||
      target.pathname.replace(/^\/api\/staging/, "");
    return route === "auth/credential-setup" ||
      route === "/auth/credential-setup"
      ? productionCredentialSetup(clean)
      : productionCandidate(clean);
  },
};
