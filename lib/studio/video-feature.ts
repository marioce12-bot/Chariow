/** Only branch-scoped Preview deployments may submit real video jobs. */
export function isStudioVideoRenderEnabledForPreview() {
  return process.env.VERCEL_ENV === "preview" && process.env.STUDIO_VIDEO_RENDER_ENABLED === "true";
}
