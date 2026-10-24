export const CREATIVE_PERFORMANCE_STUDIO_PREFILL_KEY = "creative-performance-studio-prefill-v1";

export type CreativePerformanceIdea = {
  id: string;
  title: string;
  format: "image" | "slideshow" | "video";
  rationale: string;
  prompt: string;
};

export type CreativePerformanceStudioPrefill = {
  storeId: string;
  source: Record<string, unknown> & { productId: string; productName: string };
  ideas: CreativePerformanceIdea[];
  capabilities: { image: boolean; slideshow: boolean; video: boolean; videoMessage?: string };
};
