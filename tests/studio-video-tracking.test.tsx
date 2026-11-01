// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/lib/i18n/i18n";
import { StudioView } from "@/components/dashboard/sections";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const jobId = "11111111-1111-4111-8111-111111111111";
const videoUrl = "https://media.example.test/generated-video.mp4";
const historyItem = {
  id: jobId,
  video_job_id: jobId,
  kind: "video",
  status: "processing",
  prompt: "script de test vidéo",
  options: {},
  credits_cost: 750,
  created_at: "2026-11-01T10:00:00.000Z",
  metadata: { type: "video" },
  mediaUrl: null,
};

type StatusReply = { status: number; body: Record<string, unknown> };
const reply = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function installFetch(statusReplies: StatusReply[]) {
  const jobRequests: string[] = [];
  let index = 0;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/studio/video/")) {
      jobRequests.push(url);
      const next = statusReplies[Math.min(index++, statusReplies.length - 1)];
      return reply(next.body, next.status);
    }
    if (url === "/api/studio/video") return reply({ ready: true });
    if (url === "/api/studio/credits") return reply({ balance: 2_000, reserved: 0 });
    if (url.startsWith("/api/studio/history")) return reply({ items: [historyItem], nextCursor: null });
    if (url === "/api/studio/tasks") return reply({ tasks: [] });
    if (url === "/api/account/preferences") return reply({ locale: "fr" });
    return reply({});
  });
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, jobRequests };
}

async function flushMicrotasks() {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  });
}

async function renderStudio() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<I18nProvider><StudioView products={[]} /></I18nProvider>);
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  });
  await flushMicrotasks();
}

async function showVideoPanel() {
  const choice = container?.querySelector<HTMLButtonElement>('article[data-studio-format="video"] button');
  expect(choice).toBeTruthy();
  await act(async () => {
    choice!.click();
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  });
}

async function advanceOnePoll() {
  await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
  await flushMicrotasks();
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(min-width: 1200px)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Studio video task tracking", () => {
  it("keeps the loading state through a transient 404 and displays the completed video", async () => {
    const { jobRequests } = installFetch([
      { status: 200, body: { jobId, status: "processing", progress: 35 } },
      { status: 404, body: { error: "Task not found" } },
      { status: 200, body: { jobId, status: "processing", progress: 70 } },
      { status: 200, body: { jobId, status: "completed", progress: 100, contentUrl: videoUrl } },
    ]);

    await renderStudio();
    expect(jobRequests).toEqual([`/api/studio/video/${jobId}`]);
    await showVideoPanel();
    const result = container!.querySelector<HTMLElement>(".studio-result")!;
    expect(result.getAttribute("aria-busy")).toBe("true");
    expect(result.querySelector(".studio-empty.studio-loading")).not.toBeNull();

    await advanceOnePoll();
    expect(jobRequests.at(-1)).toBe(`/api/studio/video/${jobId}`);
    expect(result.getAttribute("aria-busy")).toBe("true");
    expect(container!.textContent).toContain("nouvelle vérification automatique");
    expect(container!.textContent).not.toContain("Tâche vidéo introuvable");

    await advanceOnePoll();
    expect(jobRequests.at(-1)).toBe(`/api/studio/video/${jobId}`);
    await advanceOnePoll();

    expect(jobRequests).toEqual(Array(4).fill(`/api/studio/video/${jobId}`));
    const video = container!.querySelector<HTMLVideoElement>(`.studio-result video[src="${videoUrl}"]`);
    expect(video).not.toBeNull();
    expect(video?.hasAttribute("controls")).toBe(true);
    expect(container!.textContent).toContain("Télécharger la vidéo");
  });

  it("stops after three persistent tracking errors with an explicit unknown-status message and the history path", async () => {
    const { jobRequests } = installFetch([
      { status: 404, body: { error: "Task not found" } },
      { status: 404, body: { error: "Task not found" } },
      { status: 404, body: { error: "Task not found" } },
    ]);

    await renderStudio();
    await showVideoPanel();
    expect(container!.querySelector(".studio-result .studio-empty.studio-loading")).not.toBeNull();
    await advanceOnePoll();
    expect(container!.querySelector(".studio-result .studio-empty.studio-loading")).not.toBeNull();
    await advanceOnePoll();

    expect(jobRequests).toHaveLength(3);
    expect(container!.textContent).toContain("statut actuel de la vidéo reste inconnu");
    expect(container!.textContent).toContain(`ID : ${jobId}`);
    expect(container!.textContent).toContain("Historique du Studio");
    expect(container!.textContent).not.toContain("Tâche vidéo introuvable");
    expect(container!.querySelector(".studio-result .studio-empty.studio-loading")).toBeNull();
    expect(container!.querySelector(".studio-result")?.getAttribute("aria-busy")).toBe("false");

    await advanceOnePoll();
    expect(jobRequests).toHaveLength(3);
  });
});
