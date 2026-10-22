import { createHostedHandler } from "../src/accounts-review/hosted";
import { BlobReviewStore } from "../src/accounts-review/hosted-store";

export default {
  fetch: createHostedHandler(
    new BlobReviewStore(),
    () => process.env.AZZORA_REVIEW_PASSWORD_HASH,
  ),
};
