import { Page, Locator, expect } from "@playwright/test";

export class ProjectDashboardPage {
    readonly page: Page;
    readonly projectNameInput: Locator;
    readonly createButton: Locator;
    readonly emptyMessage: Locator;
    readonly settingsButton: Locator;
    readonly logoutButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.projectNameInput = page.locator('[aria-label="新專案名稱"]');
        this.createButton = page.locator('button').filter({ hasText: "建立" });
        this.emptyMessage = page.locator('text=尚未建立任何專案');
        this.settingsButton = page.locator('button').filter({ hasText: "設定" });
        this.logoutButton = page.locator('button').filter({ hasText: "登出" });
    }

    async waitForDashboard() {
        await this.page.waitForLoadState("networkidle");
        // The dashboard shows when no project is selected — look for the create input
        await expect(this.projectNameInput).toBeVisible({ timeout: 10000 });
    }

    async createProject(name: string) {
        await this.projectNameInput.fill(name);
        await this.createButton.click();
        // After creating, we are redirected into the project workspace
        await this.page.waitForLoadState("networkidle");
    }

    async openProject(name: string) {
        const projectCard = this.page.locator(`[aria-label="開啟專案 ${name}"]`);
        await expect(projectCard).toBeVisible({ timeout: 5000 });
        await projectCard.click();
        await this.page.waitForLoadState("networkidle");
    }

    async deleteProject(name: string) {
        const card = this.page.locator(`[aria-label="開啟專案 ${name}"]`);
        // Hover to reveal delete button
        await card.hover();
        const deleteBtn = this.page.locator(`[aria-label="刪除專案 ${name}"]`);
        // Accept browser confirm dialog
        this.page.once("dialog", (dialog) => dialog.accept());
        await deleteBtn.click();
    }

    async expectProjectExists(name: string) {
        await expect(
            this.page.locator(`[aria-label="開啟專案 ${name}"]`)
        ).toBeVisible({ timeout: 8000 });
    }

    async expectProjectNotExists(name: string) {
        await expect(
            this.page.locator(`[aria-label="開啟專案 ${name}"]`)
        ).not.toBeVisible({ timeout: 5000 });
    }

    async logout() {
        await this.logoutButton.click();
    }
}
