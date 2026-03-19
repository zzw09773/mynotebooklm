import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";
import { TEST_USER, TEST_USER_B, registerViaApi } from "../fixtures/auth";

test.describe("Login Flow", () => {
    test.beforeEach(async ({ page }) => {
        // Ensure the second test user exists
        await registerViaApi(page, TEST_USER_B.username, TEST_USER_B.password);
    });

    test("login page renders correctly", async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();

        await expect(page.locator("h1")).toContainText("NotebookLM");
        await expect(loginPage.usernameInput).toBeVisible();
        await expect(loginPage.passwordInput).toBeVisible();
        await expect(loginPage.submitButton).toBeVisible();
        await expect(loginPage.loginTab).toBeVisible();
        await expect(loginPage.registerTab).toBeVisible();
    });

    test("shows error on invalid credentials", async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();

        await loginPage.login("nonexistent_user_xyz", "wrongpassword");

        await expect(loginPage.errorAlert).toBeVisible({ timeout: 8000 });
    });

    test("shows error on wrong password", async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();

        await loginPage.login(TEST_USER.username, "wrongpassword999");

        await expect(loginPage.errorAlert).toBeVisible({ timeout: 8000 });
    });

    test("successfully logs in with valid credentials", async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();

        await loginPage.login(TEST_USER.username, TEST_USER.password);

        // Should redirect to main app (project dashboard)
        await page.waitForURL("/", { timeout: 15000 });
        await expect(page).toHaveURL("/");

        // Token should be stored in localStorage (key: notebooklm_token — see src/lib/auth.ts)
        const token = await page.evaluate(() => localStorage.getItem("notebooklm_token"));
        expect(token).toBeTruthy();
    });

    test("unauthenticated user is redirected to /login", async ({ page }) => {
        // Clear any existing auth (key: notebooklm_token — see src/lib/auth.ts)
        await page.goto("/");
        await page.evaluate(() => localStorage.removeItem("notebooklm_token"));
        await page.goto("/");

        await page.waitForURL("/login", { timeout: 10000 });
        await expect(page).toHaveURL("/login");
    });

    test("register tab switches form correctly", async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();

        await loginPage.registerTab.click();

        // Submit button text changes to "建立帳號"
        await expect(loginPage.submitButton).toContainText("建立帳號");
    });

    test("register with new user then auto-login", async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();

        const uniqueUser = `e2e_reg_${Date.now()}`;
        await loginPage.register(uniqueUser, "password123");

        // Should redirect to main app after registration
        await page.waitForURL("/", { timeout: 15000 });
        await expect(page).toHaveURL("/");

        const token = await page.evaluate(() => localStorage.getItem("notebooklm_token"));
        expect(token).toBeTruthy();
    });

    test("logout navigates back to login page", async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(TEST_USER.username, TEST_USER.password);

        await page.waitForURL("/", { timeout: 15000 });

        // Click logout on the dashboard
        const logoutBtn = page.locator("button").filter({ hasText: "登出" });
        await expect(logoutBtn).toBeVisible({ timeout: 8000 });
        await logoutBtn.click();

        await page.waitForURL("/login", { timeout: 10000 });
        await expect(page).toHaveURL("/login");
    });
});
