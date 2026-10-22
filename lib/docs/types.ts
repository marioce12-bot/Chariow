export type LocalizedText = { fr: string; en: string };
export type DocArticle = {
  id: string;
  title: LocalizedText;
  paragraphs?: LocalizedText[];
  bullets?: LocalizedText[];
  steps?: LocalizedText[];
  notice?: LocalizedText;
  links?: Array<{ href: string; label: LocalizedText }>;
};
export type DocSection = {
  id: string;
  group: "start" | "sell" | "create" | "manage";
  title: LocalizedText;
  summary: LocalizedText;
  articles: DocArticle[];
};
