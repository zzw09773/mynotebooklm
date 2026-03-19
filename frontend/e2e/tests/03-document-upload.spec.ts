import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { WorkspacePage } from "../pages/WorkspacePage";
import { ProjectDashboardPage } from "../pages/ProjectDashboardPage";
import { TEST_USER, loginViaApi, cleanupProjects } from "../fixtures/auth";

const PROJECT_PREFIX = "E2E_Upload_";
const FIXTURE_DIR = path.join(__dirname, "..", "fixtures", "files");

function createTestMarkdownFile(): string {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    const filePath = path.join(FIXTURE_DIR, "test-document.md");
    fs.writeFileSync(
        filePath,
        `# E2E Test Document

## Introduction

This is a test document used for automated end-to-end testing of the NotebookLM document upload feature.

## Key Concepts

- Document upload via file input
- Document processing pipeline
- Q&A based on document content

## Summary

NotebookLM allows users to upload PDF, image, and Markdown files to create a knowledge base for AI-powered Q&A conversations.
`,
    );
    return filePath;
}

test.describe("Document Upload", () => {
    let authToken: string;
    let projectName: string;
    let mdFilePath: string;

    test.beforeAll(async () => {
        mdFilePath = createTestMarkdownFile();
    });

    test.beforeEach(async ({ page }) => {
        authToken = await loginViaApi(page, TEST_USER.username, TEST_USER.password);
        await cleanupProjects(authToken, PROJECT_PREFIX);

        // Create a fresh project for each upload test
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

    test("upload area is visible in workspace", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        await expect(workspace.uploadArea).toBeVisible();
        await expect(page.locator("text=點擊或拖曳上傳文件")).toBeVisible();
    });

    test("can upload a markdown file", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        await workspace.uploadFile(mdFilePath);

        // The filename should appear in the document list
        await workspace.expectDocumentInList("test-document.md");
    });

    test("document count increments after upload", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        // Initial state: 0 documents
        await workspace.expectSidebarDocumentCount(0);

        await workspace.uploadFile(mdFilePath);

        // After upload: 1 document (may still be processing)
        await workspace.expectSidebarDocumentCount(1);
    });

    test("upload shows processing status", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        await workspace.uploadFile(mdFilePath);

        // The document should appear — either processing or ready
        const docEntry = page.locator("text=test-document.md");
        await expect(docEntry).toBeVisible({ timeout: 10000 });

        // Status text should be one of: processing, ready, or show page/chunk counts
        const statusText = page.locator("text=處理中").or(
            page.locator('text=/\\d+ 頁/')
        );
        await expect(statusText.first()).toBeVisible({ timeout: 10000 });
    });

    test("document file input accepts markdown files", async ({ page }) => {
        const workspace = new WorkspacePage(page);
        await workspace.waitForWorkspace();

        const fileInput = page.locator('input[type="file"]');
        const accept = await fileInput.getAttribute("accept");
        expect(accept).toContain(".md");
        expect(accept).toContain(".pdf");
    });
});
