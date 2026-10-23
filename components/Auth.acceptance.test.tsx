// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Auth } from "./Auth";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: (props: any) => createElement("img", props) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(() => { act(() => root?.unmount()); container?.remove(); });

describe("signup legal acceptance", () => {
  it("blocks browser form submission until required legal checkbox is accepted", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(createElement(Auth, { mode: "register" })));
    const form = container.querySelector("form")!;
    (form.elements.namedItem("fullName") as HTMLInputElement).value = "Aïcha";
    (form.elements.namedItem("email") as HTMLInputElement).value = "a@example.test";
    (form.elements.namedItem("password") as HTMLInputElement).value = "password123";
    const checkbox = form.querySelector<HTMLInputElement>('input[name="acceptedLegal"]')!;
    expect(checkbox.required).toBe(true);
    expect(form.checkValidity()).toBe(false);
    checkbox.checked = true;
    expect(form.checkValidity()).toBe(true);
  });
});
