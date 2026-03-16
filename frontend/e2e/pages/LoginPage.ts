import { Page, Locator, expect } from "@playwright/test";

export class LoginPage {
    readonly page: Page;
    readonly usernameInput: Locator;
    readonly passwordInput: Locator;
    readonly submitButton: Locator;
    readonly errorAlert: Locator;
    readonly loginTab: Locator;
    readonly registerTab: Locator;

    constructor(page: Page) {
        this.page = page;
        this.usernameInput = page.locator("#username");
        this.passwordInput = page.locator("#password");
        this.submitButton = page.locator('button[type="submit"]');
        this.errorAlert = page.locator('[role="alert"]');
        this.loginTab = page.locator('[role="tab"][aria-selected]').filter({ hasText: "登入" });
        this.registerTab = page.locator('[role="tab"]').filter({ hasText: "註冊" });
    }

    async goto() {
        await this.page.goto("/login");
        await this.page.waitForLoadState("networkidle");
    }

    async login(username: string, password: string) {
        await this.usernameInput.fill(username);
        await this.passwordInput.fill(password);
        await this.submitButton.click();
    }

    async register(username: string, password: string) {
        await this.registerTab.click();
        await this.usernameInput.fill(username);
        await this.passwordInput.fill(password);
        await this.submitButton.click();
    }

    async expectError(message: string) {
        await expect(this.errorAlert).toBeVisible();
        await expect(this.errorAlert).toContainText(message);
    }

    async expectLoginTabActive() {
        await expect(
            this.page.locator('[role="tab"]').filter({ hasText: "登入" })
        ).toHaveAttribute("aria-selected", "true");
    }
}
