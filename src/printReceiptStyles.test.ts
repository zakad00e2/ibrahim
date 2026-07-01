// @ts-expect-error Vitest runs this file in Node, but the app tsconfig intentionally avoids Node globals.
import { readFileSync } from "node:fs";
import postcss, { type Container, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const root = postcss.parse(css);

const printRoot = (): Container => {
  const mediaRule = root.nodes.find((node) => node.type === "atrule" && node.name === "media" && node.params === "print");

  if (!mediaRule || !("nodes" in mediaRule)) {
    throw new Error("Print media rule was not found");
  }

  return mediaRule as Container;
};

const declarationsFor = (selector: string): Record<string, string> => {
  const declarations: Record<string, string> = {};

  printRoot().walkRules((rule: Rule) => {
    if (!rule.selectors.includes(selector)) return;

    rule.walkDecls((declaration) => {
      declarations[declaration.prop] = declaration.value;
    });
  });

  return declarations;
};

const px = (value: string | undefined): number => {
  if (!value) return Number.NaN;
  return Number.parseFloat(value.replace("px", ""));
};

describe("print receipt styles", () => {
  it("uses dark, sufficiently large text for 80mm thermal receipt printing", () => {
    const receipt = declarationsFor(".print-receipt");

    expect(receipt["font-family"]).toMatch(/^"Tahoma", "Arial"/);
    expect(receipt.color).toBe("#000");
    expect(receipt["font-weight"]).toBe("700");
    expect(px(receipt["font-size"])).toBeGreaterThanOrEqual(12);
  });

  it("keeps receipt table and footer text above the minimum readable print size", () => {
    expect(px(declarationsFor(".print-receipt__items th")["font-size"])).toBeGreaterThanOrEqual(11);
    expect(px(declarationsFor(".print-receipt__items th:not(:first-child)")["font-size"])).toBeGreaterThanOrEqual(
      11,
    );
    expect(px(declarationsFor(".print-receipt__items td:not(:first-child)")["font-size"])).toBeGreaterThanOrEqual(
      11,
    );
    expect(px(declarationsFor(".print-receipt__footer")["font-size"])).toBeGreaterThanOrEqual(10.5);
  });
});
