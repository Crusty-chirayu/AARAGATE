import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`login heading contrast and motion (${reducedMotion})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: "light", reducedMotion });
    await page.goto("/login");
    await page.waitForLoadState("load");
    const heading = page.getByRole("heading", { name: "Welcome back", level: 1 });
    const capture = () => heading.evaluate(element => {
      const ancestors = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        ancestors.push({ tag: node.tagName, color: style.color, background: style.backgroundColor,
          opacity: style.opacity, transform: style.transform });
      }
      return ancestors;
    });
    await testInfo.attach("initial-heading-styles", {
      body: JSON.stringify(await capture(), null, 2), contentType: "application/json",
    });
    if (reducedMotion === "no-preference") {
      // Normal entrance animation is intentional; assess its completed rendering.
      await expect.poll(async () => (await capture()).every(s => s.opacity === "1" &&
        (s.transform === "none" || s.transform === "matrix(1, 0, 0, 1, 0, 0)"))).toBe(true);
    } else {
      // Reduced-motion users must not wait for the entrance fade/translation.
      expect((await capture()).every(s => s.opacity === "1" &&
        (s.transform === "none" || s.transform === "matrix(1, 0, 0, 1, 0, 0)"))).toBe(true);
    }
    await testInfo.attach("pre-axe-heading-styles", {
      body: JSON.stringify(await capture(), null, 2), contentType: "application/json",
    });
    await testInfo.attach("login-rendering", { body: await page.screenshot(), contentType: "image/png" });
    const result = await new AxeBuilder({ page }).analyze();
    await testInfo.attach("axe-violations", {
      body: JSON.stringify(result.violations, null, 2), contentType: "application/json",
    });
    expect(result.violations).toEqual([]);
  });
}
