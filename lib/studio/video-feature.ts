/** Real video renders are enabled only in Production; every Preview fails closed. */
export function isStudioVideoRenderEnabledForPreview() {
  return process.env.VERCEL_ENV === "production";
}
