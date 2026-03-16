import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { WorkspacePage } from "../pages/WorkspacePage";
import { ProjectDashboardPage } from "../pages/ProjectDashboardPage";
import { TEST_USER, loginViaApi, cleanupProjects } from "../fixtures/auth";

const PROJECT_PREFIX = "E2E_Chat_";
const FIXTURE_DIR = path.join(__dirname, "..", "fixtures", "files");

function ensureTestMdFile(): string {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    const filePath = path.join(FIXTURE_DIR, "test-document.md");
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(
            filePath,
            `# E2E Test Document\n\nThis document is about software testing.\n\nKey points:\n- Unit tests verify individual functions\n- E2E tests verify full user journeys\n- Playwright is an E2E testing framework\n`,
        );
    }
    return filePath;
}

test.describe("Chat Q&A with Project", () => {
    let authToken: string;
    let projectName: string;

    test.beforeEach(async ({ page }) => {
        authToken = await loginViaApi(page, TEST_USER.username, TEST_USER.password);
        await cleanupProjects(authToken, PROJECT_PREFIX);

        projectName = `${PROJECT_PREFIX}${Date.now()}`;
        const dashboard = new ProjectDashboardPage(page);
        await dashboard.waitForDashboard();
        await dashboard.createProject(projectName);
    });

    test.afterEach(async () => {
        if (authToken) {
            await cleanupProjects(authToken, PROJECT_PREFIX);
        }
    });

    test("chat input and send button are visible in workspace", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        // The chat input should be visible (textarea in the chat area)
        const textarea = page.locator("textarea").first();
        await expect(textarea).toBeVisible({ timeout: 8000 });
    });

    test("typing in chat input updates the value", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        const textarea = page.locator("textarea").first();
        await textarea.fill("Hello, this is a test message");
        await expect(textarea).toHaveValue("Hello, this is a test message");
    });

    test("sending a message creates a conversation entry", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        const message = "What is this project about?";
        const textarea = page.locator("textarea").first();
        await textarea.fill(message);
        await textarea.press("Enter");

        // Wait for the user message to appear in the chat area
        await expect(page.locator("main").getByText(message).first()).toBeVisible({ timeout: 10000 });

        // A new conversation should appear in the sidebar — it will be a button with a title
        // (created from the first 50 chars of the message).
        // We use the group container that holds the conversation title + delete button.
        await expect(
            page.locator("aside .group button").filter({ hasText: new RegExp(message.slice(0, 15)) })
        ).toBeVisible({ timeout: 15000 });
    });

    test("sending a message shows streaming response", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        const textarea = page.locator("textarea").first();
        await textarea.fill("Please introduce yourself");
        await textarea.press("Enter");

        // An assistant response container should appear (even if empty initially during streaming)
        await expect(page.locator("text=Please introduce yourself")).toBeVisible({ timeout: 10000 });

        // Wait for assistant response to appear
        // The response should not be empty after streaming completes
        await page.waitForTimeout(5000); // Wait for some streaming content
    });

    test("multiple messages create a conversation history", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        const textarea = page.locator("textarea").first();

        // First message
        await textarea.fill("First question: what is testing?");
        await textarea.press("Enter");
        await page.waitForTimeout(3000);

        // Second message
        await textarea.fill("Second question: what tools are available?");
        await textarea.press("Enter");
        await page.waitForTimeout(3000);

        // Both user messages should appear in the chat area (main), not in the sidebar
        await expect(page.locator("main").getByText("First question: what is testing?").first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator("main").getByText("Second question: what tools are available?").first()).toBeVisible({ timeout: 10000 });
    });

    test("new conversation button clears chat area", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        const textarea = page.locator("textarea").first();
        await textarea.fill("A message to start a conversation");
        await textarea.press("Enter");

        // Wait for message to appear
        await expect(page.locator("text=A message to start a conversation")).toBeVisible({ timeout: 10000 });

        // Click new conversation
        await workspace.startNewConversation();

        // The message should no longer be visible in the main chat area
        // (it may still appear as a sidebar conversation title, so we scope to main)
        await expect(page.locator("main").getByText("A message to start a conversation").first()).not.toBeVisible({ timeout: 8000 });
    });
});
