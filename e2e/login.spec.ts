import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const student = {
  email: "e2e.student@nycstudents.net",
  password: "E2e-password-2026!",
  osis: "123456789",
  grade: "10",
};

async function openStudentRegistration(page: Page, path = "/login") {
  await page.goto(path);
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

  test("keeps registration progress and honors Retry-After after a Supabase 429", async ({ page }) => {
    let requests = 0;
    await page.route("**/auth/v1/signup**", async (route) => {
      requests += 1;
      await route.fulfill({
        status: 429,
        headers: { "Access-Control-Expose-Headers": "Retry-After", "Retry-After": "120" },
        contentType: "application/json",
        body: JSON.stringify({ code: "over_request_rate_limit", message: "Too many requests" }),
      });
    });
    await openStudentRegistration(page, "/login?next=%2Fclubs%2Fcheck-in%3Fcode%3DSCHOOL26");
    await page.getByLabel("Full name").fill("Rate Limited Student");
    await page.getByLabel("OSIS number").fill(student.osis);
    await page.getByLabel("Grade").selectOption(student.grade);
    await page.getByLabel("Password").fill(student.password);
    await page.getByRole("checkbox", { name: /I have read/ }).check();
    await page.getByRole("button", { name: "Create account" }).last().click();

    await expect(page.getByRole("status")).toContainText("Too many sign-in requests");
    await expect(page.getByRole("button", { name: "Try again in 120s" })).toBeDisabled();
    await expect(page.getByLabel("Full name")).toHaveValue("Rate Limited Student");
    await expect(page.getByLabel("OSIS number")).toHaveValue(student.osis);
    await expect(page).toHaveURL(/next=%2Fclubs%2Fcheck-in%3Fcode%3DSCHOOL26/);
    expect(requests).toBe(1);
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

test("a scanned attendance code survives the sign-in redirect", async ({ page }) => {
  await page.goto("/clubs/check-in?code=ABCD2345");
  await expect(page).toHaveURL(/\/login\?/);
  const current = new URL(page.url());
  expect(current.pathname).toBe("/login");
  expect(current.searchParams.get("next")).toBe("/clubs/check-in?code=ABCD2345");
});
