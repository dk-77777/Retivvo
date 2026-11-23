import { expect, type Page } from "@playwright/test";
import axe from "axe-core";

declare global {
  interface Window {
    axe: Pick<typeof axe, "run">;
  }
}

export async function expectAccessible(page: Page) {
  await page.evaluate(axe.source);
  const violations = await page.evaluate(async () => {
    const { violations } = await window.axe.run({
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    });
    return violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    }));
  });
  expect(violations).toEqual([]);
}
