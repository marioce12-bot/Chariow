// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Auth } from "./Auth";

const signInWithPassword = vi.fn();
const resend = vi.fn();
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({
    locale: "fr",
    t: (key: string, params?: { seconds?: number }) => {
      if (key === "auth.emailNotConfirmed") return "Ton email n'est pas encore validé. On vient de t'envoyer un nouveau lien.";
      if (key === "auth.emailNotConfirmedCooldown") return `Ton email n'est pas encore validé. Attends encore ${params?.seconds ?? 0} s.`;
      if (key === "auth.resendVerificationLink") return "Renvoyer le lien";
      if (key === "auth.tooManyRequests") return "Trop de tentatives récentes.";
      return key;
    },
  }),
}));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ auth: { signInWithPassword, resend } }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: (props: any) => createElement("img", props) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let originalLocation: Location;

async function setupLogin() {
  originalLocation = window.location;
  const locationMock = { href: "", origin: "https://example.test" };
  Object.defineProperty(window, "location", { configurable: true, value: locationMock });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(createElement(Auth, { mode: "login", successRedirect: "/preview/creative-performance" })); });
  const form = container.querySelector("form")!;
  (form.elements.namedItem("email") as HTMLInputElement).value = "a@example.test";
  (form.elements.namedItem("password") as HTMLInputElement).value = "password123";
  return { form, locationMock };
}

async function submitLogin(form: HTMLFormElement) {
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("Auth login confirmation", () => {
  it("redirects a successful login to the supplied local preview path", async () => {
    const { form, locationMock } = await setupLogin();
    signInWithPassword.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    await submitLogin(form);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "a@example.test", password: "password123" });
    expect(locationMock.href).toBe("/preview/creative-performance");
  });

  it("resends confirmation after email_not_confirmed and displays a success notice", async () => {
    const { form } = await setupLogin();
    signInWithPassword.mockResolvedValue({ data: null, error: { code: "email_not_confirmed", message: "Email not confirmed" } });
    resend.mockResolvedValue({ data: {}, error: null });
    await submitLogin(form);

    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "a@example.test",
      options: { emailRedirectTo: "https://example.test/auth/confirm?next=/dashboard" },
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Ton email n'est pas encore validé. On vient de t'envoyer un nouveau lien.");
    expect(container.textContent).not.toContain("Email not confirmed");
    expect((container.querySelector('[role="status"] button') as HTMLButtonElement).disabled).toBe(true);
  });

  it("honors the existing per-email session cooldown without resending", async () => {
    const { form } = await setupLogin();
    sessionStorage.setItem(`vendeo_auth_cooldown:register:a@example.test`, String(Date.now() + 30_000));
    signInWithPassword.mockResolvedValue({ data: null, error: { code: "email_not_confirmed", message: "Email not confirmed" } });
    await submitLogin(form);

    expect(resend).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.textContent).toMatch(/Attends encore \d+ s/);
    expect((container.querySelector('[role="status"] button') as HTMLButtonElement).disabled).toBe(true);
  });

  it("maps resend rate limits to the friendly auth message", async () => {
    const { form } = await setupLogin();
    signInWithPassword.mockResolvedValue({ data: null, error: { code: "email_not_confirmed", message: "Email not confirmed" } });
    resend.mockResolvedValue({ data: null, error: { code: "over_email_send_rate_limit", message: "Email rate limit exceeded" } });
    await submitLogin(form);

    expect(container.textContent).toContain("Trop de tentatives récentes.");
    expect(container.textContent).not.toContain("Email rate limit exceeded");
    expect((container.querySelector('[role="status"] button') as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps other login errors unchanged and does not call resend", async () => {
    const { form } = await setupLogin();
    signInWithPassword.mockResolvedValue({ data: null, error: { code: "invalid_credentials", message: "Invalid login credentials" } });
    await submitLogin(form);

    expect(resend).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Invalid login credentials");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
