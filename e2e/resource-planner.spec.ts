import { expect, test } from "@playwright/test";

test("loads sample scenario and exports a native scenario file", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Portfolio Scenario Planner" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Program Orion 5 FTE-years/i }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export scenario/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toContain(".resourceplan.json");
});
