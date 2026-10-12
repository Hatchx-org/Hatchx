import { expect, test } from "@playwright/test";

test("@visual login page visual baseline", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await expect(page).toHaveScreenshot("login-page.png", {
    animations: "disabled",
    fullPage: true,
  });
});
