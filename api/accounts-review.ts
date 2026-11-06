import { createHostedHandler } from "../src/accounts-review/hosted.js";
import { BlobReviewStore } from "../src/accounts-review/hosted-store.js";

export default {
  fetch:
    process.env.AZZORA_AI_GENERAL_DOCUMENTS === "fictional-v1"
      ? async () => new Response("Not found", { status: 404 })
      : createHostedHandler(
          new BlobReviewStore(),
          () => process.env.AZZORA_REVIEW_PASSWORD_HASH,
        ),
};
