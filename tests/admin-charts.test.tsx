// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdminSignupChart } from "@/components/AdminSignupChart";
import { AdminSectionChart } from "@/components/AdminSectionChart";
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = (node: React.ReactNode) => act(() => root.render(node));
describe("admin chart fidelity", () => {
  it("plots only returned observations, in chronological order, on a zero-based integer axis", () => {
    const rows = [{ day: "2026-10-17", count: 3 }, { day: "2026-10-12", count: 1 }];
    render(<AdminSignupChart rows={rows} locale="fr" />);
    expect(container.querySelectorAll("[data-count]")).toHaveLength(2);
    expect([...container.querySelectorAll("[data-count]")].map(n => n.getAttribute("data-count"))).toEqual(["1", "3"]);
    expect(rows[0].day).toBe("2026-10-17");
    expect(container.querySelector(".signup-viz-total strong")?.textContent).toBe("4");
    expect(container.querySelector(".signup-viz-axis")?.textContent).toBe("0");
    expect(container.textContent).toContain("Les jours non retournés ne sont pas tracés");
  });
  it("switches to exact points without bridging missing dates, supports keyboard selection", () => {
    render(<AdminSignupChart rows={[{ day: "2026-10-12", count: 1 }, { day: "2026-10-14", count: 2 }]} locale="en" />);
    act(() => [...container.querySelectorAll("button")].find(b => b.textContent === "Line")!.click());
    expect(container.querySelectorAll("circle[data-count]")).toHaveLength(2);
    expect(container.querySelector("path")?.getAttribute("d")).toBe("");
    act(() => container.querySelector("g[role=button]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(container.querySelector(".signup-viz-detail")?.textContent).toContain("October 12, 2026");
  });
  it("keeps a single observation honest and zero data finite", () => {
    render(<AdminSignupChart rows={[{ day: "2026-10-17", count: 0 }]} locale="fr" />);
    expect(container.textContent).toContain("Un seul jour retourné");
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(container.querySelector("rect[data-count]")?.getAttribute("height")).toBe("0");
  });
  it("uses UTC date labels even in a western time zone and handles 30 points", () => {
    render(<AdminSignupChart rows={Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, count: i }))} locale="en" />);
    expect(container.querySelectorAll("[data-count]")).toHaveLength(30);
    expect(container.querySelector("g[role=button]")?.getAttribute("aria-label")).toContain("September 1, 2026");
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
  it("does not manufacture an empty series", () => {
    render(<AdminSignupChart rows={[]} locale="en" />);
    expect(container.textContent).toBe("");
  });
  it("ranks sections by the same recorded seconds and preserves the original rows", () => {
    const rows = [{ section: "Studio", seconds: 30, visits: 2, users: 1 }, { section: "Dashboard", seconds: 90, visits: 4, users: 3 }];
    render(<AdminSectionChart rows={rows} locale="en" />);
    expect([...container.querySelectorAll(".admin-section-viz__label")].map(n => n.textContent)).toEqual(["Dashboard", "Studio"]);
    expect(container.textContent).toContain("75%");
    expect(container.querySelectorAll(".admin-section-viz__bar")[0].getAttribute("style")).toContain("100%");
    expect(rows[0].section).toBe("Studio");
  });
  it("keeps zero-section widths at zero, without invalid shares", () => {
    render(<AdminSectionChart rows={[{ section: "Studio", seconds: 0, visits: 0, users: 0 }]} locale="fr" />);
    expect(container.textContent).toContain("0%");
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(container.querySelector(".admin-section-viz__bar")?.getAttribute("style")).toContain("0%");
  });
});
