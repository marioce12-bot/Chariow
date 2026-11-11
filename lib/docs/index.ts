import { assistantSections } from "./assistant";
import { coreIntegrationSections } from "./integrations-core";
import { socialIntegrationSections } from "./integrations-social";
import { commerceSections } from "./commerce";
import { studioManageSections } from "./studio-manage";
import { adPerformanceSections } from "./creative-performance";
import type { DocSection, LocalizedText } from "./types";

const allSections: DocSection[] = [
  ...commerceSections,
  ...coreIntegrationSections,
  ...socialIntegrationSections,
  ...assistantSections,
  ...studioManageSections,
  ...adPerformanceSections,
];

export const documentationGroups = ["start", "sell", "create", "manage"] as const;
export const documentationSections: DocSection[] = documentationGroups.flatMap(group =>
  allSections.filter(section => section.group === group),
);
export const groupNames: Record<(typeof documentationGroups)[number], LocalizedText> = {
  start: { fr: "Prendre ses repères", en: "Getting started" },
  sell: { fr: "Vendre & mesurer", en: "Selling & measuring" },
  create: { fr: "Créer avec Vendeo", en: "Creating with Vendeo" },
  manage: { fr: "Gérer son espace", en: "Managing your workspace" },
};
