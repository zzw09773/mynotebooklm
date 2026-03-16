import { Page, Locator, expect } from "@playwright/test";
import * as path from "path";

export class WorkspacePage {
    readonly page: Page;
    readonly sidebar: Locator;
    readonly uploadArea: Locator;
    readonly chatInput: Locator;
    readonly sendButton: Locator;
    readonly backButton: Locator;
    readonly newConversationButton: Locator;
    readonly documentList: Locator;
    readonly conversationList: Locator;
    readonly messagesArea: Locator;
    readonly errorBanner: Locator;

    constructor(page: Page) {
        this.page = page;
        this.sidebar = page.locator("aside");
        this.uploadArea = page.locator('[aria-label="上傳文件"]');
        // Chat input — find textarea or input in the chat area
        this.chatInput = page.locator('textarea, input[type="text"]').last();
        this.sendButton = page.locator('button[aria-label*="傳送"], button[aria-label*="send"], button[title*="Send"]').first();
        this.backButton = page.locator('[aria-label="返回專案列表"]');
        this.newConversationButton = page.locator('[aria-label="新對話"]').first();
        this.documentList = page.locator('text=來源文件');
        this.conversationList = page.locator('text=歷史對話');
        this.messagesArea = page.locator('[class*="chat"], [class*="message"], main').first();
        this.errorBanner = page.locator('[role="alert"]');
    }

    async waitForWorkspace() {
        await this.page.waitForLoadState("networkidle");
        // Sidebar is visible in workspace mode
        await expect(this.sidebar).toBeVisible({ timeout: 10000 });
    }

    async uploadFile(filePath: string) {
        const fileInput = this.page.locator('input[type="file"]');
        await fileInput.setInputFiles(filePath);
        await this.page.waitForLoadState("networkidle");
    }

    async expectDocumentInList(filename: string) {
        await expect(
            this.page.locator(`text=${filename}`)
        ).toBeVisible({ timeout: 10000 });
    }

    async sendMessage(message: string) {
        // Find the chat textarea — it's in the main content area, not sidebar
        const textarea = this.page.locator("textarea").first();
        await textarea.fill(message);
        // Try pressing Enter to send
        await textarea.press("Enter");
    }

    async waitForAssistantReply() {
        // Wait for streaming to complete — no loading state visible
        await this.page.waitForFunction(() => {
            // Check that there's at least one assistant message with non-empty content
            const msgs = document.querySelectorAll('[class*="message"], [class*="chat"] p');
            return msgs.length > 0;
        }, { timeout: 30000 });
        // Give a bit of time for streaming to finish
        await this.page.waitForTimeout(2000);
    }

    async clickConversation(title: string) {
        const convBtn = this.page.locator("button").filter({ hasText: title });
        await expect(convBtn).toBeVisible({ timeout: 5000 });
        await convBtn.click();
        await this.page.waitForLoadState("networkidle");
    }

    async startNewConversation() {
        // Click "新對話..." button in the conversation sidebar
        const newConvBtn = this.page.locator("button").filter({ hasText: "新對話" }).first();
        await newConvBtn.click();
    }

    async getConversationTitles(): Promise<string[]> {
        // Get all conversation buttons in the sidebar (skip "新對話...")
        const convButtons = this.sidebar.locator("button").filter({ hasText: /^(?!.*新對話)/ });
        const count = await convButtons.count();
        const titles: string[] = [];
        for (let i = 0; i < count; i++) {
            const text = await convButtons.nth(i).textContent();
            if (text && text.trim() && !text.includes("返回") && !text.includes("收合")) {
                titles.push(text.trim());
            }
        }
        return titles;
    }

    async goBackToDashboard() {
        await this.backButton.click();
        await this.page.waitForLoadState("networkidle");
    }

    async expectSidebarDocumentCount(count: number) {
        await expect(
            this.page.locator(`text=來源文件 (${count})`)
        ).toBeVisible({ timeout: 8000 });
    }

    async expectSidebarConversationCount(count: number) {
        await expect(
            this.page.getByText(`歷史對話 (${count})`, { exact: false })
        ).toBeVisible({ timeout: 8000 });
    }
}
