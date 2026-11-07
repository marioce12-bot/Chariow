// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Auth } from "./Auth";

const signUp = vi.fn();
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ auth: { signUp } }) }));
vi.mock("@/lib/meta-pixel", () => ({ trackSuccessfulRegistration: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: (props: any) => createElement("img", props) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("signup referral attribution", () => {
  it("captures a valid referral URL code and sends it with signup metadata", async () => {
    window.history.replaceState(null, "", "/register?ref=a1b2c3d4e5f607182930abcd");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    signUp.mockResolvedValue({ data: { session: null, user: { id: "new-user" } }, error: null });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root.render(createElement(Auth, { mode: "register" })); });

    const form = container.querySelector("form")!;
    (form.elements.namedItem("fullName") as HTMLInputElement).value = "Aïcha";
    (form.elements.namedItem("experienceLevel") as HTMLSelectElement).value = "beginner";
    (form.elements.namedItem("email") as HTMLInputElement).value = "a@example.test";
    (form.elements.namedItem("password") as HTMLInputElement).value = "password123";
    (form.elements.namedItem("acceptedLegal") as HTMLInputElement).checked = true;

    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });

    expect((form.elements.namedItem("referralCode") as HTMLInputElement).value).toBe("A1B2C3D4E5F607182930ABCD");
    expect(signUp).toHaveBeenCalledWith({
      email: "a@example.test",
      password: "password123",
      options: { data: { full_name: "Aïcha", experience_level: "beginner", referral_code: "A1B2C3D4E5F607182930ABCD" } },
    });
    expect(window.localStorage.getItem("vendeo_referral_code")).toBeNull();
  });

  it("does not send an invalid referral code from the URL", async () => {
    window.history.replaceState(null, "", "/register?ref=not-a-code");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    signUp.mockResolvedValue({ data: { session: null, user: { id: "new-user" } }, error: null });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root.render(createElement(Auth, { mode: "register" })); });

    const form = container.querySelector("form")!;
    (form.elements.namedItem("fullName") as HTMLInputElement).value = "Aïcha";
    (form.elements.namedItem("experienceLevel") as HTMLSelectElement).value = "beginner";
    (form.elements.namedItem("email") as HTMLInputElement).value = "a@example.test";
    (form.elements.namedItem("password") as HTMLInputElement).value = "password123";
    (form.elements.namedItem("acceptedLegal") as HTMLInputElement).checked = true;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });

    expect(signUp).toHaveBeenCalledWith({
      email: "a@example.test",
      password: "password123",
      options: { data: { full_name: "Aïcha", experience_level: "beginner" } },
    });
  });
});
