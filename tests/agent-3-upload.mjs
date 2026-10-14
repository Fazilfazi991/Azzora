import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";

const phase = process.env.QA_PHASE || "baseline";
const output = "docs/agent-3-evidence";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch(browserOptions);
const checks = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(`${auditUrl}/#/site-updates`);
    await page
      .getByRole("button", { name: "+ Post Site Update", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const upload = dialog.getByLabel("Upload photos", { exact: true });
    const image = fs.readFileSync("public/assets/azzora-logo.png");
    await upload.setInputFiles({
      name: "QA-first.png",
      mimeType: "image/png",
      buffer: image,
    });
    await expect(dialog.locator(".photo-grid img")).toHaveCount(1);
    await page.evaluate(() => {
      const read = FileReader.prototype.readAsDataURL;
      FileReader.prototype.readAsDataURL = function (blob) {
        setTimeout(() => read.call(this, blob), 1200);
      };
    });
    await upload.setInputFiles({
      name: "QA-second.png",
      mimeType: "image/png",
      buffer: image,
    });
    await expect(dialog.getByRole("status")).toHaveText("Reading files…");
    const remove = dialog.getByRole("button", { name: "Remove", exact: true });
    const removalAllowedDuringRead = await remove.isEnabled();
    if (phase === "final") await expect(remove).toBeDisabled();
    else await remove.click();
    await expect(dialog.getByRole("status")).toHaveCount(0);
    await expect(dialog.locator(".photo-grid img")).toHaveCount(2);
    checks.push({
      width,
      removalAllowedDuringRead,
      removedFileResurrected: phase !== "final",
    });
    if (phase === "final") {
      await remove.first().click();
      await expect(dialog.locator(".photo-grid img")).toHaveCount(1);
      await expect(dialog.locator(".photo-grid")).not.toContainText(
        "QA-first.png",
      );
      await upload.setInputFiles({
        name: "QA-oversize.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(750001),
      });
      await expect(dialog.getByRole("alert")).toContainText(
        "smaller than 750 KB",
      );
      await expect(dialog.locator(".photo-grid img")).toHaveCount(1);
      await dialog
        .getByLabel("Work completed", { exact: true })
        .fill("QA fictional partition inspection");
      await dialog
        .getByRole("button", { name: "Post Update", exact: true })
        .click();
      await page.reload();
      await expect(
        page.getByText("QA fictional partition inspection", { exact: true }),
      ).toBeVisible();
      const photos = await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("azzora-demo-v1")).updates.find(
            (u) => u.completed === "QA fictional partition inspection",
          ).photos,
      );
      expect(photos.map((p) => p.name)).toEqual(["QA-second.png"]);
      checks.at(-1).persistenceAndSizeValidation = "passed";
      await page.screenshot({
        path: `${output}/attachment-fixed-${width}.png`,
      });
    }
    await context.close();
  }
} finally {
  fs.writeFileSync(
    `${output}/upload-${phase}.json`,
    JSON.stringify({ phase, auditUrl, checks }, null, 2),
  );
  await browser.close();
}
console.log(`${phase}: ${checks.length} isolated upload race checks.`);
