/** This experimental branch must never connect to an inherited production database. */
export function assertRetentionIsolation() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isolatedHost = process.env.NEXT_PUBLIC_RETENTION_ISOLATED_HOST;
  if (process.env.VERCEL_ENV === "production") throw new Error("Account retention is Preview-only.");
  if (!url || !isolatedHost) throw new Error("Preview bloquée : configurez une base isolée avant de continuer.");
  const parsed = new URL(url);
  const realHosts = ["wlroozwtsdlgaohdklif.supabase.co", "xndowktwfawcfpbxybml.supabase.co"];
  if (realHosts.includes(parsed.hostname)) throw new Error("Les bases réelles sont interdites pour cette Preview.");
  if (parsed.hostname !== isolatedHost || !["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("Preview bloquée : la base ne correspond pas à la base isolée autorisée.");
  }
  if (isolatedHost !== "localhost" && isolatedHost !== "127.0.0.1" && !isolatedHost.endsWith(".supabase.co")) {
    throw new Error("Hôte de base isolée non reconnu.");
  }
}
