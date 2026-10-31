export type FalJobReference = { endpoint: string; requestId: string };

const ENDPOINT_RE = /^[a-z0-9][a-z0-9._/-]{1,199}$/i;
const REQUEST_ID_RE = /^[a-z0-9][a-z0-9_-]{7,127}$/i;
const TASK_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseFalJobReference(jobId: string): FalJobReference {
  const separatorIndex = jobId.lastIndexOf("::");
  if (separatorIndex < 0) throw new Error("Identifiant Fal invalide");
  const endpoint = jobId.slice(0, separatorIndex);
  const requestId = jobId.slice(separatorIndex + 2);
  if (!ENDPOINT_RE.test(endpoint) || !REQUEST_ID_RE.test(requestId)) throw new Error("Identifiant Fal invalide");
  return { endpoint, requestId };
}

export function encodeFalJobReference(endpoint: string, requestId: string) {
  if (!ENDPOINT_RE.test(endpoint) || !REQUEST_ID_RE.test(requestId)) throw new Error("Référence Fal invalide");
  return `${endpoint}::${requestId}`;
}

export function falJobReferenceMetadata(prefix: string, jobId: string) {
  const { endpoint, requestId } = parseFalJobReference(jobId);
  return {
    [`${prefix}JobId`]: jobId,
    [`${prefix}FalEndpoint`]: endpoint,
    [`${prefix}FalRequestId`]: requestId,
  };
}

/** Read the composite ID first, then rebuild it from the durable endpoint/request_id pair. */
export function storedFalJobReference(metadata: Record<string, unknown>, prefix: string): string | null {
  const composite = metadata[`${prefix}JobId`];
  if (typeof composite === "string") {
    try { parseFalJobReference(composite); return composite; } catch { /* try the durable pair */ }
  }
  const endpoint = metadata[`${prefix}FalEndpoint`];
  const requestId = metadata[`${prefix}FalRequestId`];
  if (typeof endpoint !== "string" || typeof requestId !== "string") return null;
  try { return encodeFalJobReference(endpoint, requestId); } catch { return null; }
}

export function isFalProviderReference(value: string): boolean {
  try { parseFalJobReference(value); return true; } catch { return REQUEST_ID_RE.test(value); }
}

export function isStudioVideoTaskReference(value: string): boolean {
  return TASK_UUID_RE.test(value) || isFalProviderReference(value);
}

const PROVIDER_PREFIXES = ["segment0", "segment1", "continuityFrame", "merge"] as const;

/** Resolve a Vendeo task UUID, legacy video_job_id, or a Fal composite/request_id to its owner-scoped row. */
export async function findStudioVideoRowForUser(admin: any, userId: string, jobReference: string, select: string) {
  // Postgres rejects endpoint::request_id (or an opaque request_id) against a
  // UUID column with 22P02. Only query id when the supplied value is a UUID.
  const columns = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(jobReference)
    ? ["video_job_id", "id"] : ["video_job_id"];
  for (const column of columns) {
    const result = await admin.from("studio_generations").select(select).eq("user_id", userId).eq(column, jobReference).maybeSingle();
    if (result.error || result.data) return result;
  }
  if (!isFalProviderReference(jobReference)) return { data: null, error: null };

  let parsed: FalJobReference | null = null;
  try { parsed = parseFalJobReference(jobReference); } catch { /* The caller supplied a raw request_id. */ }
  const requestId = parsed?.requestId ?? jobReference;

  if (parsed) {
    for (const prefix of PROVIDER_PREFIXES) {
      const result = await admin.from("studio_generations").select(select)
        .eq("user_id", userId).eq(`metadata->>${prefix}JobId`, jobReference).maybeSingle();
      if (result.error || result.data) return result;
    }
    for (const prefix of PROVIDER_PREFIXES) {
      const result = await admin.from("studio_generations").select(select)
        .eq("user_id", userId)
        .eq(`metadata->>${prefix}FalEndpoint`, parsed.endpoint)
        .eq(`metadata->>${prefix}FalRequestId`, requestId)
        .maybeSingle();
      if (result.error || result.data) return result;
    }
    return { data: null, error: null };
  }

  for (const prefix of PROVIDER_PREFIXES) {
    const result = await admin.from("studio_generations").select(select)
      .eq("user_id", userId).eq(`metadata->>${prefix}FalRequestId`, requestId).maybeSingle();
    if (result.error || result.data) return result;
  }
  // Backward compatibility for existing rows that saved only endpoint::request_id.
  // Escape PostgreSQL LIKE metacharacters allowed by the request_id validator.
  const escapedRequestId = requestId.replace(/[\\%_]/g, "\\$&");
  for (const prefix of PROVIDER_PREFIXES) {
    const result = await admin.from("studio_generations").select(select)
      .eq("user_id", userId).like(`metadata->>${prefix}JobId`, `%::${escapedRequestId}`).maybeSingle();
    if (result.error || result.data) return result;
  }
  return { data: null, error: null };
}
