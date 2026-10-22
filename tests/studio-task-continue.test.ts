import { describe, expect, it } from "vitest";
import { continuationQuote } from "@/lib/studio/background-tasks";

const row = (overrides: any = {}) => ({ status: "failed", metadata: {
  taskKind: "slideshow", revision: 4, stages: Array.from({ length: 4 }, (_, step) => ({ step, kind: "image", state: "completed", generationId: `image-${step}` })),
  continueQueued: true, ...overrides,
} });
const task = (images: string[]) => ({ status: "failed", errorCode: "STUDIO_STEP_FAILED", images: images.map((id) => ({ id })) });

describe("studio task continue quote", () => {
  it("quotes the exact 20-credit missing fifth image", () => {
    expect(continuationQuote(row(), task(["image-0", "image-1", "image-2", "image-3"]))).toEqual({
      allowed: true, reason: null, cost: 20, nextStep: "image", requiresConfirmation: true,
    });
  });
  it("quotes zero credits for render when five images are already stored", () => {
    expect(continuationQuote(row({ revision: 5 }), task(["1", "2", "3", "4", "5"]))).toEqual({
      allowed: true, reason: null, cost: 0, nextStep: "render", requiresConfirmation: false,
    });
  });
  it("blocks uncertain stages but allows a completed child reconciled into image refs", () => {
    const uncertain = row({ stages: [{ step: 4, kind: "image", state: "uncertain", generationId: "recovered" }] });
    expect(continuationQuote(uncertain, task([]))).toMatchObject({ allowed: false, reason: "STAGE_UNCERTAIN" });
    expect(continuationQuote(uncertain, task(["recovered"]))).toMatchObject({ allowed: true, cost: 80 });
  });
  it("blocks legacy tasks without stage proof and does not imply a charged step", () => {
    expect(continuationQuote(row({ revision: 2, stages: undefined, continueQueued: undefined }), task([])))
      .toMatchObject({ allowed: false, reason: "STAGE_HISTORY_UNKNOWN" });
  });
  it("never resumes a running task or a non-slideshow task", () => {
    expect(continuationQuote({ ...row(), status: "processing" }, task([]))).toMatchObject({ allowed: false, reason: "TASK_NOT_FAILED" });
    expect(continuationQuote(row({ taskKind: "image" }), task([]))).toMatchObject({ allowed: false, reason: "UNSUPPORTED_TASK" });
  });
  it("accepts a verified legacy queued-dispatch checkpoint, never an arbitrary legacy failure", () => {
    const legacy = row({ phase: "failed", revision: 5, stages: undefined, continueQueued: undefined, error: "Le suivi serveur n’a pas pu continuer. Aucune étape payante n’est relancée." });
    const saved = { ...task(["1", "2", "3", "4"]), sourceImagesConfirmed: true };
    expect(continuationQuote(legacy, saved)).toMatchObject({ allowed: true, cost: 20 });
    expect(continuationQuote(legacy, { ...saved, sourceImagesConfirmed: false })).toMatchObject({ allowed: false });
    expect(continuationQuote({ ...legacy, metadata: { ...legacy.metadata, revision: 4 } }, saved)).toMatchObject({ allowed: false });
    expect(continuationQuote({ ...legacy, metadata: { ...legacy.metadata, error: "network" } }, saved)).toMatchObject({ allowed: false, reason: "STAGE_HISTORY_UNKNOWN" });
  });

});
