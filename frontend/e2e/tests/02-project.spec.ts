import { test, expect } from "@playwright/test";
import { ProjectDashboardPage } from "../pages/ProjectDashboardPage";
import { TEST_USER, loginViaApi, cleanupProjects } from "../fixtures/auth";

const PROJECT_PREFIX = "E2E_Test_";

test.describe("Project Creation and Selection", () => {
    let authToken: string;

    test.beforeEach(async ({ page }) => {
        authToken = await loginViaApi(page, TEST_USER.username, TEST_USER.password);
        // Clean up any leftover test projects before each test
        await cleanupProjects(authToken, PROJECT_PREFIX);
        await page.reload();
        await page.waitForLoadState("networkidle");
    });

    test.afterEach(async () => {
        // Clean up created projects
        if (authToken) {
            await cleanupProjects(authToken, PROJECT_PREFIX);
        }
    });

    test("project dashboard renders after login", async ({ page }) => {
        const dashboard = new ProjectDashboardPage(page);
        await dashboard.waitForDashboard();

        await expect(page.locator("h1")).toContainText("NotebookLM");
        await expect(dashboard.projectNameInput).toBeVisible();
        await expect(dashboard.createButton).toBeVisible();
        await expect(dashboard.logoutButton).toBeVisible();
    });

    test("can create a new project", async ({ page }) => {
        const dashboard = new ProjectDashboardPage(page);
        await dashboard.waitForDashboard();

        const projectName = `${PROJECT_PREFIX}Create_${Date.now()}`;
        await dashboard.projectNameInput.fill(projectName);
        await dashboard.createButton.click();

        // After creating a project, we are taken into the workspace
        // The sidebar should appear
        await expect(page.locator("aside")).toBeVisible({ timeout: 10000 });

        // Go back to dashboard and verify the project is listed
        const backBtn = page.locator('[aria-label="返回專案列表"]');
        await backBtn.click();
        await dashboard.waitForDashboard();

        await dashboard.expectProjectExists(projectName);
    });

    test("can create a project by pressing Enter", async ({ page }) => {
        const dashboard = new ProjectDashboardPage(page);
        await dashboard.waitForDashboard();

        const projectName = `${PROJECT_PREFIX}Enter_${Date.now()}`;
        await dashboard.projectNameInput.fill(projectName);
        await dashboard.projectNameInput.press("Enter");

        // Should enter the workspace
        await expect(page.locator("aside")).toBeVisible({ timeout: 10000 });
    });

    test("can open an existing project", async ({ page }) => {
        const dashboard = new ProjectDashboardPage(page);
        await dashboard.waitForDashboard();

        // Create a project first
        const projectName = `${PROJECT_PREFIX}Open_${Date.now()}`;
        await dashboard.projectNameInput.fill(projectName);
        await dashboard.createButton.click();
        await expect(page.locator("aside")).toBeVisible({ timeout: 10000 });

        // Go back
        await page.locator('[aria-label="返回專案列表"]').click();
        await dashboard.waitForDashboard();

        // Open the project again
        await dashboard.openProject(projectName);

        // Should be in workspace with project name in sidebar
        await expect(page.locator("aside")).toBeVisible({ timeout: 10000 });
        await expect(page.locator("aside")).toContainText(projectName);
    });

    test("can delete a project", async ({ page }) => {
        const dashboard = new ProjectDashboardPage(page);
        await dashboard.waitForDashboard();

        const projectName = `${PROJECT_PREFIX}Delete_${Date.now()}`;
        await dashboard.projectNameInput.fill(projectName);
        await dashboard.createButton.click();
        await expect(page.locator("aside")).toBeVisible({ timeout: 10000 });

        // Go back
        await page.locator('[aria-label="返回專案列表"]').click();
        await dashboard.waitForDashboard();
        await dashboard.expectProjectExists(projectName);

        // Delete the project
        await dashboard.deleteProject(projectName);

        // Project should disappear from the list
        await dashboard.expectProjectNotExists(projectName);
    });

    test("empty state message when no projects exist", async ({ page }) => {
        const dashboard = new ProjectDashboardPage(page);
        await dashboard.waitForDashboard();

        // If there are no projects after cleanup, the empty message should show
        const projectCards = page.locator('[aria-label^="開啟專案"]');
        const count = await projectCards.count();

        if (count === 0) {
            await expect(dashboard.emptyMessage).toBeVisible();
        } else {
            // Skip assertion when pre-existing projects are present
            test.info().annotations.push({
                type: "info",
                description: `${count} pre-existing projects found; skipping empty state check`,
            });
        }
    });
});
