export const stagingEnabled =
  (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_AZZORA_STAGING === "1";

export type StagingSession = {
  email: string;
  userId: string;
  personId?: string;
  role: string;
  workspace: "manager" | "accountant";
  csrf: string;
  mode?: string;
  capabilities?: string[];
  projectIds?: string[];
};
export type StagingAuthStep = {
  status: "mfa-enroll" | "mfa-challenge" | "authenticated";
  qr?: string;
  qrCode?: string;
  uri?: string;
  csrf?: string;
};
export class StagingRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues: { field: string; message: string }[] = [],
    public readonly code?: string,
  ) {
    super(message);
  }
}
export async function stagingRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/staging${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
  });
  const result = await response.json().catch(() => {
    throw new StagingRequestError(
      "The staging service returned an unreadable response. Your changes have not been confirmed.",
      response.status,
    );
  });
  if (!response.ok)
    throw new StagingRequestError(
      result?.error || "The staging request could not be completed.",
      response.status,
    );
  return result as T;
}

export const stagingJson = (value: unknown, csrf?: string): RequestInit => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(csrf ? { "X-Azzora-CSRF": csrf } : {}),
  },
  body: JSON.stringify(value),
});
