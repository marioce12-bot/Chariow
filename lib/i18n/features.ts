import { optionsCopy } from "./options-copy";
import { finalCopy } from "./final-copy";
import { serverMessages3Copy } from "./server-messages3-copy";
import { serverMessages2Copy } from "./server-messages2-copy";
import { serverMessages1Copy } from "./server-messages1-copy";
import { dynamicCopy } from "./dynamic-copy";
import { sweep3Copy } from "./sweep3-copy";
import { sweep2Copy } from "./sweep2-copy";
import { sweep1Copy } from "./sweep1-copy";
import { interfaceCopy } from "./interface-copy";
import { analysisCopy } from "./analysis-copy";
import { overviewCopy } from "./overview-copy";
import { publicCompleteCopy } from "./public-complete-copy";
import { adminCompleteCopy } from "./admin-complete-copy";
import { wizardCopy } from "./wizard-copy";
import { profitCopy } from "./profit-copy";
import type { Locale } from "./locales";
import { sectionsCopy } from "./sections-copy";
import { dashboardCopy } from "./dashboard-copy";
import { adsCopy } from "./ads-copy";
import { publicCopy } from "./public-copy";
import { workspaceCopy } from "./workspace-copy";
import { adminCopy } from "./admin-copy";

export const featureCopyGroups = {
  options: optionsCopy,
  final: finalCopy,
  serverMessages3: serverMessages3Copy,
  serverMessages2: serverMessages2Copy,
  serverMessages1: serverMessages1Copy,
  dynamic: dynamicCopy,
  sweep3: sweep3Copy,
  sweep2: sweep2Copy,
  sweep1: sweep1Copy,
  interface: interfaceCopy,
  analysis: analysisCopy,
  overview: overviewCopy,
  publicComplete: publicCompleteCopy,
  adminComplete: adminCompleteCopy,
  wizard: wizardCopy,
  profit: profitCopy,
  sections: sectionsCopy,
  dashboard: dashboardCopy,
  ads: adsCopy,
  public: publicCopy,
  workspace: workspaceCopy,
  admin: adminCopy,
};

export const featureTranslations: Record<Locale, Record<string, string>> = {
  fr: Object.assign({}, ...Object.values(featureCopyGroups).map((copy) => copy.fr)),
  en: Object.assign({}, ...Object.values(featureCopyGroups).map((copy) => copy.en)),
};
