import { expect, test } from "@playwright/test";

const liveEnabled = process.env.HATCHX_E2E_LIVE === "1";

test.describe("@live authenticated Club access", () => {
  test.skip(!liveEnabled, "Set HATCHX_E2E_LIVE=1 and provide an isolated test environment.");

  test("student can sign in and cannot open Club management without a management role", async ({ page }) => {
    const email = process.env.HATCHX_E2E_STUDENT_EMAIL;
    const password = process.env.HATCHX_E2E_STUDENT_PASSWORD;
    if (!email || !password) test.skip(true, "Provide HATCHX_E2E_STUDENT_EMAIL and HATCHX_E2E_STUDENT_PASSWORD.");

    await page.goto("/login?next=/clubs/manage");
    await page.getByLabel("School email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/clubs/manage");
    await expect(page.getByRole("heading", { name: /Club management/i })).not.toBeVisible();
  });
});
