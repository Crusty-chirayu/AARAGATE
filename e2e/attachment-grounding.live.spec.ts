import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { composer, messageLog } from "./helpers";

const baseUrl = process.env.AARAGATE_E2E_URL;
const email = process.env.AARAGATE_E2E_EMAIL;
const password = process.env.AARAGATE_E2E_PASSWORD;
const expectedCode = process.env.AARAGATE_E2E_EXPECTED_CODE;
const enabled = Boolean(baseUrl && email && password);

function makePdf(code: string): Buffer {
  const lines = [
    "AARAGATE ATTACHMENT TEST",
    `Verification code: ${code}`,
  ];
  const stream = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    `(${lines[0]}) Tj`,
    ...lines.slice(1).map((line) => `0 -18 Td\n(${line}) Tj`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

test.skip(!enabled, "Set AARAGATE_E2E_URL, AARAGATE_E2E_EMAIL and AARAGATE_E2E_PASSWORD for a real Supabase run.");

test("PDF grounding waits for processing, cites retrieved context, and declines absent facts", async ({ page }) => {
  test.setTimeout(120_000);
  const origin = baseUrl!.replace(/\/+$/, "");
  const code = expectedCode ?? `AARAGATE-${randomUUID().replaceAll("-", "").slice(0, 10)}-X`;
  const filename = `grounding-${randomUUID().slice(0, 8)}.pdf`;
  let processorCompleted = false;
  let invokedAiBeforeProcessing = false;

  page.on("requestfinished", (request) => {
    if (request.url().includes("/functions/v1/attachment-processor")) {
      processorCompleted = true;
    }
  });
  page.on("request", (request) => {
    if (
      request.url().includes("/functions/v1/ai-orchestrator") &&
      !processorCompleted
    ) {
      invokedAiBeforeProcessing = true;
    }
  });

  await page.goto(`${origin}/login`);
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/app");
  await page.getByRole("button", { name: /New AI chat/ }).click();
  await page.waitForURL(/\/app\/c\/[0-9a-f-]+/);

  await page.getByTestId("attachment-input").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: makePdf(code),
  });
  await composer(page).fill("What is the verification code in the attached document?");
  await composer(page).press("Enter");

  const firstReply = messageLog(page).locator('[id^="msg-"]').filter({ hasText: code }).last();
  await expect(firstReply).toContainText(code, { timeout: 90_000 });
  await expect(firstReply.getByTestId("citation-list")).toContainText(filename);
  expect(invokedAiBeforeProcessing).toBe(false);

  await composer(page).fill(
    "According only to the attached document, what is the owner's postal address? If absent, say it is not in the document.",
  );
  await composer(page).press("Enter");
  const replies = messageLog(page).locator('[id^="msg-"]').filter({ hasText: "Assistant" });
  const unsupportedReply = replies.last();
  await expect(unsupportedReply).toContainText(/not in the document|does not contain|no postal address/i, {
    timeout: 90_000,
  });
  await expect(unsupportedReply.getByTestId("citation-list")).toHaveCount(0);
  expect(invokedAiBeforeProcessing).toBe(false);
});
