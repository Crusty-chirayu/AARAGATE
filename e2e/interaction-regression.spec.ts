import { test } from "@playwright/test";
import { expect, gotoDashboard, composer, messageLog } from "./helpers";

test("continuous typing, first-click selection, rename, pin and current-room deletion", async ({ page }) => {
  await gotoDashboard(page);

  // §New chat modal: first-click selection, then typing continuity.
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New chat" });
  await dialog.waitFor();
  await dialog.getByRole("button", { name: /Study room/ }).click();
  const name = dialog.getByLabel("Room name", { exact: true });
  await name.click();
  await name.pressSequentially("Engineering launch group", { delay: 25 });
  await expect(name).toHaveValue("Engineering launch group");
  await expect(name).toBeFocused();

  const topic = dialog.getByLabel(/Topic/);
  await topic.click();
  await topic.pressSequentially("Coordinate the engineering launch together", { delay: 25 });
  await expect(topic).toHaveValue("Coordinate the engineering launch together");
  await expect(topic).toBeFocused();

  // AI participation is a pressed-state button group (not radios).
  const onMention = dialog.getByRole("button", { name: "On mention" });
  const off = dialog.getByRole("button", { name: "Off" });
  await expect(onMention).toHaveAttribute("aria-pressed", "true");
  await off.click();
  await expect(off).toHaveAttribute("aria-pressed", "true");
  await expect(onMention).toHaveAttribute("aria-pressed", "false");

  await dialog.getByRole("button", { name: "Create room", exact: true }).click();
  await page.waitForURL(/\/app\/c\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: "Engineering launch group", exact: true })).toBeVisible();

  // Continuous typing stays focused in the composer.
  const input = composer(page);
  await input.click();
  await input.pressSequentially("Typing stays focused in the composer", { delay: 25 });
  await expect(input).toHaveValue("Typing stays focused in the composer");
  await expect(input).toBeFocused();
  await input.press("Enter");
  await expect(messageLog(page)).toContainText("Typing stays focused in the composer");

  // Rename via Group settings.
  await page.getByRole("button", { name: "Group settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Group settings" });
  await settings.waitFor();
  const rename = settings.getByLabel("Room name", { exact: true });
  await rename.fill("Engineering release room");
  await settings.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Engineering release room", exact: true })).toBeVisible();
  // Two "Close" buttons exist (header X + footer); take the footer one.
  await settings.getByRole("button", { name: "Close" }).last().click();

  // Pin and unpin from the sidebar row.
  await page.getByRole("button", { name: "Pin Engineering release room" }).click();
  const unpin = page.getByRole("button", { name: "Unpin Engineering release room" });
  await expect(unpin).toHaveAttribute("aria-pressed", "true");
  await unpin.click();
  await expect(page.getByRole("button", { name: "Pin Engineering release room" })).toBeVisible();

  // Delete the current room via Danger zone.
  await page.getByRole("button", { name: "Group settings", exact: true }).click();
  await settings.getByRole("button", { name: "Danger zone" }).click();
  await settings.getByRole("button", { name: "Delete permanently" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this room?" });
  await confirm.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("link", { name: /Engineering release room/ })).toHaveCount(0);
});

