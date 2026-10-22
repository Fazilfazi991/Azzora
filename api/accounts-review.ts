import { createHostedHandler } from "../src/accounts-review/hosted.js";
import { BlobReviewStore } from "../src/accounts-review/hosted-store.js";

export default {
  fetch: createHostedHandler(
    new BlobReviewStore(),
    () => process.env.AZZORA_REVIEW_PASSWORD_HASH,
  ),
};
