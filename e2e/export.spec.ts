import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";

// Smoke test: open an example project, render frames, export an MP4 and check it on disk.
test("exports an example project to MP4", async ({ page, request }) => {
  await request.post("/api/examples/install");
  await page.goto("/#/p/taskflow-promo");
  await expect(page.getByText("taskflow-promo").first()).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();

  const supported = await page.evaluate(async () => {
    if (typeof VideoEncoder === "undefined") return false;
    const r = await VideoEncoder.isConfigSupported({ codec: "avc1.42001f", width: 1280, height: 720 });
    return !!r.supported;
  });
  test.skip(!supported, "H.264 WebCodecs encoder not available in this browser build");

  // Shorten the project so the smoke test is quick.
  await request.post("/api/projects/taskflow-promo/ops", {
    data: { ops: [{ op: "remove_scene", id: "s3" }, { op: "remove_scene", id: "s5" }, { op: "remove_scene", id: "s6" }] },
  });

  await page.getByRole("button", { name: "Export" }).click();
  const dialog = page.locator("text=Export MP4").locator("..").locator("..");
  await dialog.locator("select").first().selectOption("720p");
  await dialog.getByRole("button", { name: "Export" }).click();
  await expect(page.getByText("Saved to")).toBeVisible({ timeout: 150_000 });
  const path = (await page.locator("code").textContent())!.trim();
  expect(existsSync(path)).toBe(true);
  expect(statSync(path).size).toBeGreaterThan(10_000);
  const head = readFileSync(path).subarray(4, 8).toString("latin1");
  expect(head).toBe("ftyp");
});
