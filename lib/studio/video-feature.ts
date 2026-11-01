/** Real video renders are enabled only in Vercel Preview and Production; all other environments fail closed. */
export function isStudioVideoRenderEnabledForPreview() {
  return process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "production";
}
