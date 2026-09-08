import fs from "fs";
import path from "path";

export type ProofImage = { src: string; alt: string; height: number };

// Any file in /public named "proof-<name>.jpg|jpeg|png|webp" is picked up
// automatically and added to the social-proof carousel on the marketing
// page — no code change needed, just drop the file in /public and deploy.
export function getProofImages(): ProofImage[] {
  const publicDir = path.join(process.cwd(), "public");
  let files: string[] = [];
  try {
    files = fs.readdirSync(publicDir);
  } catch {
    return [];
  }

  return files
    .filter((file) => /^proof-.+\.(jpe?g|png|webp)$/i.test(file))
    .sort()
    .map((file) => {
      const name = file
        .replace(/^proof-/, "")
        .replace(/\.(jpe?g|png|webp)$/i, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        src: `/${file}`,
        alt: `Tableau de bord Chariow de ${name}, connecté(e) à Vendeo`,
        height: 763,
      };
    });
}
