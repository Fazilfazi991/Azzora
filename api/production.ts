import { productionCandidate } from "../src/backend/runtime-handler.js";
export default {
  fetch(request: Request) {
    const headers = new Headers(request.headers);
    headers.delete("X-Azzora-Client-Address");
    return productionCandidate(new Request(request, { headers }));
  },
};
