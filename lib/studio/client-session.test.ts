import { describe, expect, it } from "vitest";
import {
  defaultStudioClientSession,
  parseStudioClientSession,
  readStudioClientSession,
  STUDIO_CLIENT_SESSION_KEY,
  writeStudioClientSession,
} from "./client-session";

type TestStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function memoryStorage(): TestStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("Studio client session", () => {
  it("persists the active creative mode, work-in-progress fields, and generation IDs", () => {
    const storage = memoryStorage();
    const session = {
      ...defaultStudioClientSession(),
      activeMode: "video" as const,
      kind: "video" as const,
      prompt: "Une démonstration produit en format vertical.",
      productId: "product-1",
      videoJobId: "job-1",
      videoRequestId: "request-1",
    };

    expect(writeStudioClientSession(session, storage)).toBe(true);
    expect(storage.values.has(STUDIO_CLIENT_SESSION_KEY)).toBe(true);
    expect(readStudioClientSession(storage)).toEqual(session);
  });

  it("restores an active slideshow session and the selected task", () => {
    const storage = memoryStorage();
    const session = {
      ...defaultStudioClientSession(),
      activeMode: "slideshow" as const,
      studioTab: "slideshow" as const,
      selectedSlideshowTaskId: "slideshow-task-1",
      selectedHistoryId: "history-1",
    };

    expect(writeStudioClientSession(session, storage)).toBe(true);
    expect(readStudioClientSession(storage)).toEqual(session);
  });

  it("rejects malformed sessions and bounds untrusted stored values", () => {
    expect(parseStudioClientSession("not json")).toBeNull();
    expect(parseStudioClientSession(JSON.stringify({ version: 2 }))).toBeNull();

    const parsed = parseStudioClientSession(JSON.stringify({
      version: 1,
      activeMode: "unexpected",
      kind: "video",
      studioTab: "unexpected",
      historyKind: "unexpected",
      prompt: "x".repeat(5_000),
      videoRequestId: { invalid: true },
    }));

    expect(parsed?.activeMode).toBeNull();
    expect(parsed?.kind).toBe("video");
    expect(parsed?.studioTab).toBe("photo");
    expect(parsed?.historyKind).toBe("all");
    expect(parsed?.prompt).toHaveLength(4_000);
    expect(parsed?.videoRequestId).toBeNull();
  });
});
