import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const student = {
  email: "e2e.student@nycstudents.net",
  password: "E2e-password-2026!",
  osis: "123456789",
  grade: "10",
};

async function openStudentRegistration(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("School email").fill(student.email);
  await expect(page.getByLabel("OSIS number")).toBeVisible();
  await expect(page.getByLabel("Grade")).toBeVisible();
}

test.describe("login and registration", () => {
  test("fits the viewport and keeps the primary controls usable", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Email sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Hatchx home" })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("starts Google OAuth with a safe callback and account chooser", async ({ page }) => {
    let oauthUrl = "";
    await page.route("**/auth/v1/authorize**", async (route) => {
      oauthUrl = route.request().url();
      await route.abort();
    });
    await page.goto("/login?next=/calendar");
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect.poll(() => oauthUrl).toContain("provider=google");
    const callback = new URL(new URL(oauthUrl).searchParams.get("redirect_to")!);
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("next")).toBe("/calendar");
    expect(oauthUrl).toContain("prompt=select_account");
  });

  test("shows student-only fields and manages multiple invitation codes", async ({ page }) => {
    await openStudentRegistration(page);

    await expect(page.getByText("Club invitation codes")).toBeVisible();
    await page.getByRole("button", { name: "+ Add another code" }).click();
    await page.getByRole("button", { name: "+ Add another code" }).click();
    await expect(page.locator('input[name="invite_code"]')).toHaveCount(3);
    await page.getByRole("button", { name: "Remove invite code 2" }).click();
    await expect(page.locator('input[name="invite_code"]')).toHaveCount(2);
  });

  test("submits normalized OSIS, grade, and deduplicated invitation codes without touching a database", async ({ page }) => {
    let requestBody: Record<string, unknown> | undefined;
    await page.route("**/auth/v1/signup**", async (route) => {
      requestBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "00000000-0000-4000-8000-000000000001", email: student.email, user_metadata: requestBody.data },
          session: null,
        }),
      });
    });
    await openStudentRegistration(page);
    await page.getByLabel("Full name").fill("E2E Student");
    await page.getByLabel("OSIS number").fill(student.osis);
    await page.getByLabel("Grade").selectOption(student.grade);
    await page.getByLabel("Password").fill(student.password);
    await page.locator('input[name="invite_code"]').fill(" robotics-26 ");
    await page.getByRole("button", { name: "+ Add another code" }).click();
    await page.locator('input[name="invite_code"]').nth(1).fill("ROBOTICS-26");
    await page.getByRole("button", { name: "+ Add another code" }).click();
    await page.locator('input[name="invite_code"]').nth(2).fill("art!club");
    await page.getByRole("checkbox", { name: /I have read/ }).check();
    await page.getByRole("button", { name: "Create account" }).last().click();

    await expect(page.getByRole("status")).toContainText("Check your school email");
    expect(requestBody).toMatchObject({
      email: student.email,
      password: student.password,
      data: {
        full_name: "E2E Student",
        osis_number: student.osis,
        grade_level: 10,
        invite_codes: ["ROBOTICS-26", "ARTCLUB"],
      },
    });
  });

  test("rejects non-school registration addresses before any network request", async ({ page }) => {
    let called = false;
    await page.route("**/auth/v1/signup**", async (route) => {
      called = true;
      await route.abort();
    });
    await page.goto("/login");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("Full name").fill("Outside User");
    await page.getByLabel("School email").fill("outside@example.com");
    await page.getByLabel("Password").fill(student.password);
    await page.getByRole("checkbox", { name: /I have read/ }).check();
    await page.getByRole("button", { name: "Create account" }).last().click();

    await expect(page.getByRole("status")).toContainText("NYC Public Schools");
    expect(called).toBe(false);
  });

  test("has no serious or critical Axe violations", async ({ page }) => {
    await openStudentRegistration(page);
    const results = await new AxeBuilder({ page }).analyze();
    const severe = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    expect(severe, severe.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
  });
});

test("unauthenticated users are redirected away from protected profile pages", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile|\/login\?next=\/profile/);
});
