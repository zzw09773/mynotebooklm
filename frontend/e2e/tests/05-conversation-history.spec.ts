import { test, expect } from "@playwright/test";
import { WorkspacePage } from "../pages/WorkspacePage";
import { ProjectDashboardPage } from "../pages/ProjectDashboardPage";
import { TEST_USER, loginViaApi, cleanupProjects } from "../fixtures/auth";
import { getProjectIdByName, createConversationViaApi, addMessageViaApi } from "../fixtures/api";

const PROJECT_PREFIX = "E2E_ConvHist_";

test.describe("Conversation History Loading", () => {
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

    test("conversations appear in sidebar after chat message sent", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        const textarea = page.locator("textarea").first();
        await textarea.fill("Test conversation message");
        await textarea.press("Enter");

        // A conversation entry should appear in the sidebar — inside the .group container
        await expect(
            page.locator("aside .group button").first()
        ).toBeVisible({ timeout: 15000 });
    });

    test("clicking a conversation loads its messages (API-seeded)", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        // Get the project ID to create a conversation via API
        const projectId = await getProjectIdByName(authToken, projectName);
        expect(projectId).not.toBeNull();

        // Seed a conversation with messages via API
        const seededMessage = "What is the capital of France?";
        const conv = await createConversationViaApi(authToken!, projectId!, "France Question");
        await addMessageViaApi(authToken!, conv.id, "user", seededMessage);
        await addMessageViaApi(authToken!, conv.id, "assistant", "The capital of France is Paris.");

        // Reload the page — this returns to the project dashboard (state is not persisted)
        await page.reload();
        await page.waitForLoadState("networkidle");

        // Re-open the project from the dashboard
        const dashboard = new ProjectDashboardPage(page);
        await dashboard.waitForDashboard();
        await dashboard.openProject(projectName);

        // Now in workspace — wait for conversations API to load
        await page.waitForResponse(
            (r) => r.url().includes("/conversations") && r.url().includes("project_id"),
            { timeout: 10000 },
        );
        await workspace.waitForWorkspace();

        // The conversation should appear in sidebar
        await expect(page.locator("aside .group")).toBeVisible({ timeout: 10000 });

        // Click the conversation — wait for the messages API response
        const convButton = page.locator("aside .group button").first();
        const [messagesResponse] = await Promise.all([
            page.waitForResponse((resp) => resp.url().includes("/messages"), { timeout: 10000 }),
            convButton.click(),
        ]);
        expect(messagesResponse.ok()).toBeTruthy();

        // Seeded message should appear in the chat area
        await expect(page.locator("main").getByText(seededMessage).first()).toBeVisible({ timeout: 10000 });
    });

    test("switching between conversations shows correct messages (API-seeded)", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        const projectId = await getProjectIdByName(authToken, projectName);
        expect(projectId).not.toBeNull();

        // Seed two conversations with distinct messages
        const msg1 = "Conversation Alpha: unique content about Apollo";
        const msg2 = "Conversation Beta: unique content about Artemis";

        const conv1 = await createConversationViaApi(authToken!, projectId!, "Conv Alpha");
        await addMessageViaApi(authToken!, conv1.id, "user", msg1);
        await addMessageViaApi(authToken!, conv1.id, "assistant", "Apollo is a space program.");

        const conv2 = await createConversationViaApi(authToken!, projectId!, "Conv Beta");
        await addMessageViaApi(authToken!, conv2.id, "user", msg2);
        await addMessageViaApi(authToken!, conv2.id, "assistant", "Artemis is a lunar mission.");

        // Reload returns to the project dashboard — navigate back into the project
        await page.reload();
        await page.waitForLoadState("networkidle");

        const dashboard = new ProjectDashboardPage(page);
        await dashboard.waitForDashboard();
        await dashboard.openProject(projectName);

        await page.waitForResponse(
            (r) => r.url().includes("/conversations") && r.url().includes("project_id"),
            { timeout: 10000 },
        );
        await workspace.waitForWorkspace();

        // Both conversations should appear in sidebar
        const convGroups = page.locator("aside .group");
        await expect(convGroups).toHaveCount(2, { timeout: 10000 });

        // Click second conversation (lower in list — newer additions are at top)
        const [resp1] = await Promise.all([
            page.waitForResponse((r) => r.url().includes("/messages"), { timeout: 10000 }),
            convGroups.nth(0).locator("button").first().click(),
        ]);
        expect(resp1.ok()).toBeTruthy();
        // Most recently created conversation (Beta) is at top
        await expect(page.locator("main").getByText(msg2).first()).toBeVisible({ timeout: 10000 });

        // Click first conversation (Alpha)
        const [resp2] = await Promise.all([
            page.waitForResponse((r) => r.url().includes("/messages"), { timeout: 10000 }),
            convGroups.nth(1).locator("button").first().click(),
        ]);
        expect(resp2.ok()).toBeTruthy();
        // Older conversation (Alpha) should now show
        await expect(page.locator("main").getByText(msg1).first()).toBeVisible({ timeout: 10000 });
    });

    test("active conversation is highlighted in sidebar", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        const textarea = page.locator("textarea").first();
        await textarea.fill("Starting a highlighted conversation");
        await textarea.press("Enter");

        // Wait for a .group conversation entry to appear in sidebar
        await expect(page.locator("aside .group").first()).toBeVisible({ timeout: 15000 });

        // The active conversation button should have the active styling (primary color class)
        const convGroup = page.locator("aside .group").first();
        const activeConvBtn = convGroup.locator("button").first();
        await expect(activeConvBtn).toBeVisible({ timeout: 15000 });
        const classAttr = await activeConvBtn.getAttribute("class");
        expect(classAttr).toContain("primary");
    });

    test("deleted conversation is removed from sidebar", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        const textarea = page.locator("textarea").first();
        await textarea.fill("Message to be deleted");
        await textarea.press("Enter");

        const convGroup = page.locator("aside .group").first();
        const convButton = convGroup.locator("button").first();
        await expect(convButton).toBeVisible({ timeout: 15000 });

        const convTitle = await convButton.textContent();

        // Hover over conversation to reveal delete button
        await convGroup.hover();

        const deleteBtn = convGroup.locator('[aria-label^="刪除對話"]');
        await expect(deleteBtn).toBeVisible({ timeout: 5000 });
        await deleteBtn.click();

        // The conversation group should disappear
        if (convTitle) {
            await expect(
                page.locator("aside .group button").filter({ hasText: convTitle.trim() })
            ).not.toBeVisible({ timeout: 8000 });
        }
    });
});
