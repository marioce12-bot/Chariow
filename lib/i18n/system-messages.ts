import type { Locale } from "./locales";
import { profitCopy } from "./profit-copy";
import { serverMessages1Copy } from "./server-messages1-copy";
import { serverMessages2Copy } from "./server-messages2-copy";
import { serverMessages3Copy } from "./server-messages3-copy";

const exactEnglish = new Map<string, string>();
for (const copy of [serverMessages1Copy, serverMessages2Copy, serverMessages3Copy]) {
  for (const [key, source] of Object.entries(copy.fr)) exactEnglish.set(source, copy.en[key]);
}

/** Only application-authored messages are recognized. Unknown or user-authored content is preserved. */
export function localizeSystemMessage(message: string, locale: Locale): string;
export function localizeSystemMessage(message: string | null | undefined, locale: Locale): string | null | undefined;
export function localizeSystemMessage(message: string | null | undefined, locale: Locale): string | null | undefined {
  if (locale !== "en" || typeof message !== "string") return message;
  return exactEnglish.get(message) ?? profitCopy.en[message] ?? message;
}

/** A missing installation check must not be presented as proof that no pixel is installed. */
export function localizeTrackingIssue(issue: { code: string; message: string }, locale: Locale): string {
  if (locale !== "en") return issue.message;
  const code = issue.code === "pixel_unknown" && issue.message === "L’installation du pixel Chariow n’a pas pu être vérifiée."
    ? "pixel_unverified" : issue.code;
  const template = profitCopy.en[`tracking.${code}`];
  if (!template) return localizeSystemMessage(issue.message, locale);
  const count = issue.message.match(/^\d+/)?.[0];
  if (template.includes("{count}") && count === undefined) return issue.message;
  return template.replaceAll("{count}", count ?? "");
}

/** Reformat display-only numbers; no currency conversion or profitability calculation happens here. */
function englishNumber(raw: string): string {
  const normalized = raw.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  const value = Number(normalized);
  return normalized && Number.isFinite(value)
    ? value.toLocaleString("en-US", { maximumFractionDigits: 10 }) : raw;
}

type Pattern = [RegExp, (groups: RegExpMatchArray) => string];
const financialPatterns: Pattern[] = [
  [/^CPA observé (\S+) (\S+) contre seuil de rentabilité (\S+) (\S+), sur (\d+) vente\(s\) payée\(s\)\.( Échantillon limité : aucune augmentation recommandée\.)?$/, m =>
    `Observed CPA ${englishNumber(m[1])} ${m[2]} versus a break-even threshold of ${englishNumber(m[3])} ${m[4]}, across ${m[5]} paid sale(s).${m[6] ? " Limited sample: no increase recommended." : ""}`],
  [/^Rentable : (.+?) de ventes nettes pour (.+?) de pub\. Rentabilité : (.+?) %\.$/, m =>
    `Profitable: ${englishNumber(m[1])} in net sales for ${englishNumber(m[2])} in advertising. Return on ad spend: ${englishNumber(m[3])}%.`],
  [/^Valeur client fiable : coût par client de (.+?) sous le plafond de (.+?)\. La première vente n'a pas encore couvert la dépense : laisser tourner\.$/, m =>
    `Reliable customer value: cost per customer of ${englishNumber(m[1])} below the ceiling of ${englishNumber(m[2])}. The first sale has not yet covered the spend: keep running.`],
  [/^(.+?) dépensés sans aucune vente confirmée\. L'audience touchée ne convertit pas : la campagne brûle le budget sans rien rapporter\.$/, m =>
    `${englishNumber(m[1])} spent without any confirmed sales. The audience reached is not converting: the campaign is spending its budget without generating revenue.`],
  [/^Rentabilité : (.+?) %\. (.+?) de ventes nettes pour (.+?) de pub : la campagne coûte plus qu'elle ne rapporte\.$/, m =>
    `Return on ad spend: ${englishNumber(m[1])}%. ${englishNumber(m[2])} in net sales for ${englishNumber(m[3])} in advertising: the campaign costs more than it earns.`],
  [/^Rentabilité de (.+?) %, mais dépense encore faible \((.+?)\) : on attend d'avoir plus de données avant de trancher\.$/, m =>
    `Return on ad spend of ${englishNumber(m[1])}%, but spend is still low (${englishNumber(m[2])}): wait for more data before deciding.`],
  [/^Rentabilité de (.+?) %, proche du seuil : la campagne collecte encore des données, on la laisse tourner sous surveillance\.$/, m =>
    `Return on ad spend of ${englishNumber(m[1])}%, close to break-even: the campaign is still collecting data; keep running and monitor it.`],
  [/^(\d+) vente\(s\) confirmée\(s\) pour (.+?) de pub \((.+?) brut\)\. La campagne reste sous surveillance\.$/, m =>
    `${m[1]} confirmed sale(s) for ${englishNumber(m[2])} in advertising (${englishNumber(m[3])} gross). The campaign remains under monitoring.`],
  [/^Réduire : aucune vente confirmée après (.+?) de dépense ; seuil CPA réel (.+?)\.$/, m =>
    `Reduce: no confirmed sales after ${englishNumber(m[1])} in spend; actual CPA threshold ${englishNumber(m[2])}.`],
  [/^CPA observé (.+?) \((\d+) ventes confirmées\) comparé au seuil de (.+?) fondé sur la valeur client historique réelle\.$/, m =>
    `Observed CPA ${englishNumber(m[1])} (${m[2]} confirmed sales) compared with a threshold of ${englishNumber(m[3])} based on actual historical customer value.`],
];

export function localizeFinancialMessage(message: string, locale: Locale): string {
  if (locale !== "en") return message;
  const exact = localizeSystemMessage(message, locale);
  if (exact !== message) return exact;
  for (const [pattern, render] of financialPatterns) {
    const match = message.match(pattern);
    if (match) return render(match);
  }
  return message;
}
