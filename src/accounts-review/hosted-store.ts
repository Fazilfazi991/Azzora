import { BlobPreconditionFailedError, del, get, put } from "@vercel/blob";

export interface StoredValue<T> {
  value: T;
  version: string;
}
export interface ReviewStore {
  read<T>(path: string): Promise<StoredValue<T> | null>;
  write<T>(path: string, value: T, version?: string): Promise<void>;
  remove(path: string, version: string): Promise<void>;
}
export class ReviewConflict extends Error {}
export const encodeReview = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? { $fils: item.toString() } : item,
  );
export const decodeReview = <T>(value: string): T =>
  JSON.parse(value, (_key, item) =>
    item &&
    typeof item === "object" &&
    Object.keys(item).length === 1 &&
    typeof item.$fils === "string"
      ? BigInt(item.$fils)
      : item,
  );

export class BlobReviewStore implements ReviewStore {
  async read<T>(path: string): Promise<StoredValue<T> | null> {
    const result = await get(`accounts-review/v1/${path}`, {
      access: "private",
      useCache: false,
      // A compressed response has a weak ETag, which cannot authorize ifMatch.
      headers: { "Accept-Encoding": "identity" },
    });
    if (!result || result.statusCode !== 200) return null;
    return {
      value: decodeReview<T>(await new Response(result.stream).text()),
      version: result.blob.etag,
    };
  }
  async write<T>(path: string, value: T, version?: string) {
    try {
      await put(`accounts-review/v1/${path}`, encodeReview(value), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: Boolean(version),
        ...(version ? { ifMatch: version } : {}),
        contentType: "application/json",
      });
    } catch (error) {
      if (
        error instanceof BlobPreconditionFailedError ||
        (error instanceof Error && /already exists/i.test(error.message))
      )
        throw new ReviewConflict(
          "The demo changed in another request. Refresh and retry.",
        );
      throw error;
    }
  }
  async remove(path: string, version: string) {
    try {
      await del(`accounts-review/v1/${path}`, { ifMatch: version });
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError)
        throw new ReviewConflict("Refresh before signing out.");
      throw error;
    }
  }
}
