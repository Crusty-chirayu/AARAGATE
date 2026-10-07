import { test } from "@playwright/test";
import { expect, gotoDashboard, startAiChat } from "./helpers";

test("documents are available in Documents, not as conversational chat attachments", async ({
  page,
}) => {
  await gotoDashboard(page);
  await expect(page.getByRole("link", { name: /Documents/ })).toBeVisible();
  await startAiChat(page);

  await expect(page.getByTestId("attachment-input")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Attach a file" })).toHaveCount(0);
});
