import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

const baseUrl = process.env.AARAGATE_E2E_URL;
const email = process.env.AARAGATE_E2E_EMAIL;
const password = process.env.AARAGATE_E2E_PASSWORD;

function makePdf(): Buffer {
  const lines = [
    "Computer Networks study notes",
    "Selective Repeat ARQ accepts and buffers out-of-order frames.",
    "The sender retransmits only frames whose acknowledgments are missing.",
    "With a sequence number space of N, the maximum sender window is N divided by 2.",
  ];
  const stream = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    ...lines.map((line, index) =>
      index === 0 ? `(${line}) Tj` : `0 -18 Td\n(${line}) Tj`,
    ),
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
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

test.skip(
  !(baseUrl && email && password),
  "Set the live AARAGATE E2E URL, email and password to run this production flow.",
);

test("a processed PDF can be read and used to generate document-grounded practice", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const origin = baseUrl!.replace(/\/+$/, "");
  const filename = `study-${randomUUID().slice(0, 8)}.pdf`;

  await page.goto(`${origin}/login`);
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/app");
  await page.goto(`${origin}/app/documents`);

  await page.getByLabel("Upload a study PDF").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: makePdf(),
  });
  await page.getByRole("button", { name: "Read extracted content" }).waitFor();
  await page.getByRole("button", { name: "Read extracted content" }).click();
  const contentDialog = page.getByRole("dialog", { name: filename });
  await expect(contentDialog).toContainText("Selective Repeat ARQ");
  await expect(contentDialog).toContainText("maximum sender window");
  await contentDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("link", { name: "Practice with this document" }).click();
  await page.waitForURL(/\/app\/practice\?doc=/);
  await page.getByLabel("Topic (optional)").fill("Selective Repeat ARQ");
  await page.getByLabel("MCQ (single answer)").fill("1");
  await page.getByLabel("MSQ (multiple answers)").fill("0");
  await page.getByLabel("NAT (numeric)").fill("0");
  await page.getByRole("button", { name: "Start practice" }).click();
  await page.waitForURL(/\/app\/practice\/[0-9a-f-]+/);

  const question = page.locator('li[id^="question-"]').first();
  await expect(question).toContainText(/Selective Repeat/i, { timeout: 120_000 });
  await expect(question).toContainText("AI-generated practice question");

  await page.goto(`${origin}/app/documents`);
  await page.getByRole("button", { name: `Delete ${filename}` }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete this document?" });
  await deleteDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(filename)).toHaveCount(0);
});
