import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { translate } from "./translate";

function frontendFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? frontendFiles(file) : file.endsWith(".tsx") && !file.includes(".test.") ? [file] : [];
  });
}

const references: Array<{ file: string; key: string; variables: string[] | null }> = [];
for (const file of [...frontendFiles("components"), ...frontendFiles("app")]) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "t" && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      const argument = node.arguments[1];
      references.push({
        file,
        key: node.arguments[0].text,
        variables: argument && ts.isObjectLiteralExpression(argument)
          ? argument.properties.flatMap((property) => ts.isSpreadAssignment(property) ? [] : property.name ? [property.name.getText(source).replace(/["']/g, "")] : [])
          : null,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

describe("frontend translation coverage", () => {
  it.each(["fr", "en"] as const)("resolves every statically referenced UI key in %s", (locale) => {
    const missing = references.filter(({ key }) => translate(locale, key) === key);
    expect(missing).toEqual([]);
  });

  it("passes the named parameters used by each literal translation call", () => {
    const mismatches = references.flatMap(({ file, key, variables }) => {
      if (!variables) return [];
      const required = [...new Set([...(translate("en", key)).matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map((match) => match[1]))];
      return required.filter((variable) => !variables.includes(variable)).map((variable) => ({ file, key, variable }));
    });
    expect(mismatches).toEqual([]);
  });
});
