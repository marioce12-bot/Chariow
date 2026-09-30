import { defineConfig } from "vitest/config";
import path from "node:path";

// jsx: "automatic" pour pouvoir tester le rendu des composants (tsconfig utilise jsx: preserve pour Next.js).
export default defineConfig({ esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve(__dirname) } }, test: { environment: "node" } });
