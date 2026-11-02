import { randomUUID } from "node:crypto";
import type { ReviewState } from "../domain";
import { attachment } from "../domain.js";
import {
  emptyEntries,
  fieldsSchema,
  type Extraction,
  type Upload,
} from "./model.js";
import {
  digestOf,
  disabledExtractor,
  sampleExtractor,
  type DocumentExtractor,
} from "./providers.js";
import { localPdfExtractor } from "./local-pdf.js";
import { inspectFields, suggest } from "./review.js";
import { z } from "zod";

export async function extractDocument(
  previous: ReviewState,
  file: Upload,
  extractor?: DocumentExtractor,
  at = new Date().toISOString(),
) {
  file = z
    .object({
      name: z.string().min(1).max(120),
      mime: z.string(),
      data: z.string().max(2800000),
    })
    .strict()
    .parse(file);
  const next = structuredClone(previous),
    entries = next.documentEntries ?? emptyEntries();
  const id = `DOC-${randomUUID()}`;
  // Reuse existing signed-type / size validation before any possible provider call.
  attachment(next, `${id}-file`, file);
  const sha256 = digestOf(file);
  const existing = entries.reviews.find((d) => d.sha256 === sha256);
  if (existing) return { state: previous, id: existing.id, reused: true };
  if (entries.reviews.length >= 40)
    throw Error("This demo session supports up to 40 document reviews.");
  if (next.attachments.reduce((s, a) => s + a.size, 0) > 6000000)
    throw Error("This demo session supports up to 6 MB of attachments.");
  const started = performance.now();
  const knownSample = sampleExtractor;
  const chosenExtractor = extractor ?? {
    extract: async (upload: Upload) => {
      const sample = await knownSample.extract(upload);
      return sample.mode === "synthetic-replay"
        ? sample
        : localPdfExtractor.extract(upload);
    },
  };
  let extraction: Extraction;
  try {
    extraction = await chosenExtractor.extract(file);
    // A provider response is untrusted even when its transport acknowledged it.
    extraction = {
      ...extraction,
      fields: fieldsSchema.parse(extraction.fields),
    };
  } catch {
    // Keep the uploaded original available for manual entry; never retry a paid
    // call implicitly or fabricate fields/costs after a service failure.
    extraction = {
      ...(await disabledExtractor.extract(file)),
      provider: "Automatic extraction unavailable",
      inputTokens: extractor ? null : 0,
      outputTokens: extractor ? null : 0,
      costUsd: extractor ? null : 0,
      failureReason:
        "Automatic extraction could not be completed. Review the original and enter the missing fields manually.",
    };
  }
  const fields = suggest(extraction.fields, next);
  entries.reviews.push({
    id,
    sha256,
    attachmentId: `${id}-file`,
    createdAt: at,
    extraction: { ...extraction, latencyMs: performance.now() - started },
    fields,
    status: "Review",
    revision: 0,
    corrections: [],
    warnings: [
      ...inspectFields(fields, next, id, sha256),
      ...(extraction.failureReason
        ? [
            {
              code: "extraction-unavailable",
              field: "items",
              message: extraction.failureReason,
            },
          ]
        : []),
    ],
  });
  next.documentEntries = entries;
  return { state: next, id, reused: false };
}
