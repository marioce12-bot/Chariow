// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Auth } from "./Auth";

const signInWithPassword = vi.fn();
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ auth: { signInWithPassword } }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: (props: any) => createElement("img", props) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let originalLocation: Location;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  vi.clearAllMocks();
});

describe("Auth success redirect", () => {
  it("redirects a successful login to the supplied local preview path", async () => {
    originalLocation = window.location;
    const locationMock = { href: "", origin: "https://example.test" };
    Object.defineProperty(window, "location", { configurable: true, value: locationMock });
    signInWithPassword.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root.render(createElement(Auth, { mode: "login", successRedirect: "/preview/creative-performance" })); });
    const form = container.querySelector("form")!;
    (form.elements.namedItem("email") as HTMLInputElement).value = "a@example.test";
    (form.elements.namedItem("password") as HTMLInputElement).value = "password123";
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "a@example.test", password: "password123" });
    expect(locationMock.href).toBe("/preview/creative-performance");
  });
});
