import { describe, expect, it } from "vitest";
import { encodeFalJobReference, falJobReferenceMetadata, isStudioVideoTaskReference, parseFalJobReference, storedFalJobReference } from "@/lib/studio/video-job-reference";

const endpoint = "xai/grok-imagine-video/v1.5/text-to-video";
const requestId = "provider-request-12345";

describe("durable Fal video job references", () => {
  it("keeps each provider endpoint and request_id explicitly and reconstructs the same composite ID", () => {
    const jobId = encodeFalJobReference(endpoint, requestId);
    expect(parseFalJobReference(jobId)).toEqual({ endpoint, requestId });
    const metadata = falJobReferenceMetadata("segment1", jobId);
    expect(metadata).toEqual({
      segment1JobId: jobId,
      segment1FalEndpoint: endpoint,
      segment1FalRequestId: requestId,
    });
    expect(storedFalJobReference(metadata, "segment1")).toBe(jobId);
  });

  it("rebuilds a request reference even when a durable workflow replay sees only endpoint/request_id", () => {
    expect(storedFalJobReference({ segment0FalEndpoint: endpoint, segment0FalRequestId: requestId }, "segment0"))
      .toBe(`${endpoint}::${requestId}`);
  });

  it("accepts Vendeo task IDs and provider references, while rejecting malformed values", () => {
    expect(isStudioVideoTaskReference("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isStudioVideoTaskReference(`${endpoint}::${requestId}`)).toBe(true);
    expect(isStudioVideoTaskReference(requestId)).toBe(true);
    expect(isStudioVideoTaskReference("xai::short")).toBe(false);
    expect(isStudioVideoTaskReference("not a job id")).toBe(false);
  });
});
