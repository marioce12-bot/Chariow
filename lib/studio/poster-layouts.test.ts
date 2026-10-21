import { describe, expect, it } from "vitest";
import { buildLayoutDirection } from "./poster-layouts";

describe("variable poster composition", () => {
  it("respects orientation and explicit person selection without choosing a template", () => {
    const result = buildLayoutDirection({ orientation: "portrait", character: "without" });
    expect(result.text).toContain("vertical portrait");
    expect(result.text).toContain("Include no person");
    expect(result.text).toContain("Do not impose a recurring template");
  });
  it("allows an absent person in automatic mode and carries previous-prompt variation", () => {
    const result = buildLayoutDirection({ orientation: "square", character: "auto", previousPrompt: "last" });
    expect(result.text).toContain("A person is optional");
    expect(result.text).toContain("distinctly different");
  });
});
