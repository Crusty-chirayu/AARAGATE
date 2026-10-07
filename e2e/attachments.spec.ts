import { test } from "@playwright/test";
import {
  expect,
  expectAssistantReply,
  gotoDashboard,
  messageLog,
  sendMessage,
  startAiChat,
} from "./helpers";

test("normal chat remains available without attachment context or fabricated citations", async ({
  page,
}) => {
  await gotoDashboard(page);
  await startAiChat(page);

  await sendMessage(page, "Explain what a binary search tree is in one sentence.");
  await expectAssistantReply(page);

  await expect(messageLog(page).locator('[data-testid="citation-list"]')).toHaveCount(0);
});
