import { defineConfig, devices } from "@playwright/test";

const CHROMIUM_PATH = process.env.CHROMIUM_PATH ?? undefined;

export default defineConfig({
    testDir: "./e2e/tests",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 1,
    workers: 1,
    reporter: [
        ["html", { outputFolder: "e2e/reports/html", open: "never" }],
        ["junit", { outputFile: "e2e/reports/junit.xml" }],
        ["list"],
    ],
    use: {
        baseURL: process.env.BASE_URL || "http://localhost:3100",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "off",
        actionTimeout: 15000,
        navigationTimeout: 30000,
    },
    outputDir: "e2e/artifacts",
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                launchOptions: {
                    ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
                    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
                },
            },
        },
    ],
});
