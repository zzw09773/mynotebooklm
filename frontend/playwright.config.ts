import { defineConfig, devices } from "@playwright/test";

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
        baseURL: "http://172.16.120.35:3100",
        trace: "off",
        screenshot: "only-on-failure",
        video: "off",
        actionTimeout: 15000,
        navigationTimeout: 30000,
        // Use system Chromium on Alpine Linux inside Docker
        channel: undefined,
        launchOptions: {
            executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        },
    },
    outputDir: "e2e/artifacts",
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                launchOptions: {
                    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
                    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
                },
            },
        },
    ],
});
