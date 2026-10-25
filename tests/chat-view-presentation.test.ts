import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(new URL("../components/ChatView.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/vendeo-ai.css", import.meta.url), "utf8");

describe("ChatView presentation affordances", () => {
  it("keeps assistant actions and the optional campaign action in the assistant message card", () => {
    expect(component).toContain('className={isAssistant ? "chat-bubble assistant" : "chat-bubble user"}');
    expect(component).toContain('className="chat-bubble-actions"');
    expect(component).toContain('className="btn btn-dark chat-launch-action"');
    expect(styles).toMatch(/\.chat-bubble\.assistant\s*\{[^}]*background:#fff/);
    expect(styles).toContain(".chat-bubble.assistant .chat-copy");
  });

  it("adds a destination card to the assistant reply and routes only through the Dashboard callback", () => {
    const dashboard = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
    expect(component).toContain("const navigationTarget = isAssistant ? resolveChatNavigationForAssistantReply(messages, index) : null;");
    expect(component).toContain("navigationTarget && onNavigateSection ? <NavigationCard target={navigationTarget} locale={locale} onNavigate={onNavigateSection} /> : null");
    expect(dashboard).toContain("onNavigateSection={navigateFromAssistant}");
    expect(dashboard).toContain("setActive(section)");
  });

  it("uses a single grouped add control while preserving camera, gallery, and document inputs", () => {
    expect(component).toContain('className="chat-attach-menu"');
    expect(component).toContain("cameraInputRef.current?.click()");
    expect(component).toContain("fileInputRef.current?.click()");
    expect(component).toContain("docInputRef.current?.click()");
    expect(component).toContain('accept="image/*,video/*"');
    expect(component).toContain("application/pdf");
  });

  it("styles campaign summary labels and creative copy for scannable summaries", () => {
    expect(styles).toContain(".chat-launch-row span");
    expect(styles).toContain("text-transform:uppercase");
    expect(styles).toContain(".chat-launch-message");
    expect(styles).toContain("white-space:pre-wrap");
  });
});
