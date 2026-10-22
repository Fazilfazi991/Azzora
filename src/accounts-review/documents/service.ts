import { randomUUID } from "node:crypto";
import type { ReviewState } from "../domain";
import { attachment } from "../domain.js";
import { emptyEntries, type Upload } from "./model.js";
import {
  digestOf,
  sampleExtractor,
  type DocumentExtractor,
} from "./providers.js";
import { inspectFields, suggest } from "./review.js";
import { z } from "zod";

export async function extractDocument(
  previous: ReviewState,
  file: Upload,
  extractor: DocumentExtractor = sampleExtractor,
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
  const extraction = await extractor.extract(file);
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
    warnings: inspectFields(fields, next, id, sha256),
  });
  next.documentEntries = entries;
  return { state: next, id, reused: false };
}
