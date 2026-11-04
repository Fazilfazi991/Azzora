import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { AccessDenied } from "./permissions.js";

export const backendCookieName = "__Host-azzora_session";
export const secretHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const newSecret = () => randomBytes(32).toString("base64url");
export function sameSecret(
  value: string | null,
  expectedHash: string,
): boolean {
  if (!value || value.length > 256 || !/^[a-f0-9]{64}$/.test(expectedHash))
    return false;
  return timingSafeEqual(
    Buffer.from(secretHash(value), "hex"),
    Buffer.from(expectedHash, "hex"),
  );
}
export function readSessionCookie(request: Request): string {
  const matches = (request.headers.get("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${backendCookieName}=`));
  if (matches.length !== 1)
    throw new AccessDenied("authentication_required", 401);
  const token = matches[0].slice(backendCookieName.length + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new AccessDenied("authentication_required", 401);
  return token;
}
export function assertTransport(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
  mutation: boolean,
): void {
  const url = new URL(request.url);
  if (url.protocol !== "https:" || !allowedOrigins.has(url.origin))
    throw new AccessDenied("origin_denied");
  if (mutation && request.headers.get("origin") !== url.origin)
    throw new AccessDenied("origin_denied");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") throw new AccessDenied("origin_denied");
}
export function sessionCookie(token: string, maxAge: number): string {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    !Number.isSafeInteger(maxAge) ||
    maxAge < 0
  )
    throw new Error("Invalid session cookie");
  return `${backendCookieName}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}
export const clearSessionCookie = `${backendCookieName}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
export const privateResponseHeaders = {
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
