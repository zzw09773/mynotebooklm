import { test, expect } from "@playwright/test";
import { WorkspacePage } from "../pages/WorkspacePage";
import { ProjectDashboardPage } from "../pages/ProjectDashboardPage";
import { TEST_USER, loginViaApi, cleanupProjects } from "../fixtures/auth";

const PROJECT_A_PREFIX = "E2E_IsoA_";
const PROJECT_B_PREFIX = "E2E_IsoB_";
const BASE_URL = "http://172.16.120.35:3100";

async function getProjectIdByName(token: string, name: string): Promise<number | null> {
    const res = await fetch(`${BASE_URL}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const project = (data.projects || []).find((p: { id: number; name: string }) => p.name === name);
    return project ? project.id : null;
}

async function createConvViaApi(token: string, projectId: number): Promise<{ id: number }> {
    const res = await fetch(`${BASE_URL}/api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: projectId, title: "Test conv" }),
    });
    if (!res.ok) throw new Error(`Create conv failed: ${res.status}`);
    return res.json();
}

async function addMsgViaApi(
    token: string,
    convId: number,
    role: "user" | "assistant",
    content: string,
): Promise<void> {
    await fetch(`${BASE_URL}/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role, content }),
    });
}

test.describe("Project Switching - Conversation Isolation", () => {
    let authToken: string;
    let projectAName: string;
    let projectBName: string;

    test.beforeEach(async ({ page }) => {
        authToken = await loginViaApi(page, TEST_USER.username, TEST_USER.password);
        await cleanupProjects(authToken, PROJECT_A_PREFIX);
        await cleanupProjects(authToken, PROJECT_B_PREFIX);
    });

    test.afterEach(async () => {
        if (authToken) {
            await cleanupProjects(authToken, PROJECT_A_PREFIX);
            await cleanupProjects(authToken, PROJECT_B_PREFIX);
        }
    });

    test("conversations from project A do not appear in project B", async ({ page }) => {
        const dashboard = new ProjectDashboardPage(page);

        // -- Setup: Create Project A --
        projectAName = `${PROJECT_A_PREFIX}${Date.now()}`;
        await dashboard.waitForDashboard();
        await dashboard.createProject(projectAName);

        // Create a conversation in Project A
        const workspaceA = new WorkspacePage(page);
        await workspaceA.waitForWorkspace();

        const textarea = page.locator("textarea").first();
        const msgA = "This message belongs to Project A";
        await textarea.fill(msgA);
        await textarea.press("Enter");

        // Wait for conversation entry to appear in sidebar
        await expect(page.locator("aside .group").first()).toBeVisible({ timeout: 15000 });

        // -- Switch back to dashboard --
        await workspaceA.goBackToDashboard();
        await dashboard.waitForDashboard();

        // -- Setup: Create Project B --
        projectBName = `${PROJECT_B_PREFIX}${Date.now()}`;
        await dashboard.createProject(projectBName);

        // Open Project B workspace
        const workspaceB = new WorkspacePage(page);
        await workspaceB.waitForWorkspace();

        // Verify the sidebar shows Project B's name
        await expect(page.locator("aside")).toContainText(projectBName);

        // Project B should have NO conversations
        await workspaceB.expectSidebarConversationCount(0);

        // The message from Project A should not be visible in Project B's chat
        await expect(page.locator("main").getByText(msgA).first()).not.toBeVisible();

        // No conversation entries in sidebar (.group container holds each conv)
        const convEntries = page.locator("aside .group");
        await expect(convEntries).toHaveCount(0, { timeout: 5000 });
    });

    test("switching back to project A restores its conversations (API-seeded)", async ({ page }) => {
        const dashboard = new ProjectDashboardPage(page);

        // -- Create Project A --
        projectAName = `${PROJECT_A_PREFIX}Restore_${Date.now()}`;
        await dashboard.waitForDashboard();
        await dashboard.createProject(projectAName);

        const workspaceA = new WorkspacePage(page);
        await workspaceA.waitForWorkspace();

        // Seed a conversation via API so it's persisted reliably
        const projectAId = await getProjectIdByName(authToken, projectAName);
        expect(projectAId).not.toBeNull();

        const convTitleA = "Restored Conv Alpha";
        const convA = await createConvViaApi(authToken, projectAId!);

        // Reload returns to the project dashboard — navigate back into Project A
        await page.reload();
        await page.waitForLoadState("networkidle");

        const dashA = new ProjectDashboardPage(page);
        await dashA.waitForDashboard();
        await dashA.openProject(projectAName);

        await page.waitForResponse(
            (r) => r.url().includes("/conversations") && r.url().includes("project_id"),
            { timeout: 10000 },
        );
        await workspaceA.waitForWorkspace();

        // Confirm conversation appears in Project A's sidebar
        await expect(page.locator("aside .group").first()).toBeVisible({ timeout: 10000 });

        // -- Go to dashboard, create and enter Project B --
        await workspaceA.goBackToDashboard();
        await dashboard.waitForDashboard();

        projectBName = `${PROJECT_B_PREFIX}Restore_${Date.now()}`;
        await dashboard.createProject(projectBName);

        const workspaceB = new WorkspacePage(page);
        await workspaceB.waitForWorkspace();

        // Confirm Project B has zero conversations
        const convEntriesB = page.locator("aside .group");
        await expect(convEntriesB).toHaveCount(0, { timeout: 5000 });

        // -- Switch back to Project A --
        await workspaceB.goBackToDashboard();
        await dashboard.waitForDashboard();
        await dashboard.openProject(projectAName);

        const workspaceA2 = new WorkspacePage(page);
        await workspaceA2.waitForWorkspace();

        // Wait for conversations fetch to complete
        await page.waitForResponse(
            (r) => r.url().includes("/conversations") && r.url().includes("project_id"),
            { timeout: 10000 },
        ).catch(() => null);
        await page.waitForTimeout(1000);

        // Project A's conversation should be restored (.group count > 0)
        const convEntriesA = page.locator("aside .group");
        await expect(convEntriesA.first()).toBeVisible({ timeout: 10000 });
        const count = await convEntriesA.count();
        expect(count).toBeGreaterThan(0);
    });

    test("document list is isolated per project", async ({ page }) => {
        const dashboard = new ProjectDashboardPage(page);

        // Create Project A
        projectAName = `${PROJECT_A_PREFIX}DocIso_${Date.now()}`;
        await dashboard.waitForDashboard();
        await dashboard.createProject(projectAName);

        const workspaceA = new WorkspacePage(page);
        await workspaceA.waitForWorkspace();

        // Project A starts with 0 documents
        await workspaceA.expectSidebarDocumentCount(0);

        // Go back and create Project B
        await workspaceA.goBackToDashboard();
        await dashboard.waitForDashboard();

        projectBName = `${PROJECT_B_PREFIX}DocIso_${Date.now()}`;
        await dashboard.createProject(projectBName);

        const workspaceB = new WorkspacePage(page);
        await workspaceB.waitForWorkspace();

        // Project B also starts with 0 documents (different from Project A's state)
        await workspaceB.expectSidebarDocumentCount(0);
    });

    test("chat area is cleared when switching between projects (API-seeded)", async ({ page }) => {
        const dashboard = new ProjectDashboardPage(page);

        // Create Project A via UI
        projectAName = `${PROJECT_A_PREFIX}ClearChat_${Date.now()}`;
        await dashboard.waitForDashboard();
        await dashboard.createProject(projectAName);

        const workspaceA = new WorkspacePage(page);
        await workspaceA.waitForWorkspace();

        // Seed a conversation and message via API (avoids streaming race condition)
        const projectAId = await getProjectIdByName(authToken, projectAName);
        expect(projectAId).not.toBeNull();

        const msgA = "Message visible only in Project A";
        const convA = await createConvViaApi(authToken, projectAId!);
        await addMsgViaApi(authToken, convA.id, "user", msgA);

        // Reload returns to dashboard — navigate back into Project A
        await page.reload();
        await page.waitForLoadState("networkidle");

        const dashA2 = new ProjectDashboardPage(page);
        await dashA2.waitForDashboard();
        await dashA2.openProject(projectAName);

        await page.waitForResponse(
            (r) => r.url().includes("/conversations") && r.url().includes("project_id"),
            { timeout: 10000 },
        );
        await workspaceA.waitForWorkspace();

        // Click the conversation to load its messages
        const convBtn = page.locator("aside .group button").first();
        await expect(convBtn).toBeVisible({ timeout: 10000 });
        await Promise.all([
            page.waitForResponse((r) => r.url().includes("/messages"), { timeout: 10000 }),
            convBtn.click(),
        ]);

        // Message should be visible in chat area
        await expect(page.locator("main").getByText(msgA).first()).toBeVisible({ timeout: 10000 });

        // Switch to Project B
        await workspaceA.goBackToDashboard();
        await dashboard.waitForDashboard();

        projectBName = `${PROJECT_B_PREFIX}ClearChat_${Date.now()}`;
        await dashboard.createProject(projectBName);

        const workspaceB = new WorkspacePage(page);
        await workspaceB.waitForWorkspace();

        // Project A's message must not be visible in Project B's chat area
        await expect(page.locator("main").getByText(msgA)).not.toBeVisible({ timeout: 8000 });
    });
});
