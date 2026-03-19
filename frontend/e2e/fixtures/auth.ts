import { Page } from "@playwright/test";

const BASE_URL = "http://172.16.120.35:3100";
const API_URL = "http://172.16.120.35:8100";

export const TEST_USER = {
    username: "e2etest01",
    password: "testpass01",
};

export const TEST_USER_B = {
    username: "e2etest02",
    password: "testpass02",
};

/**
 * Login via the API and inject the JWT token into localStorage.
 * Much faster than going through the UI for setup.
 */
export async function loginViaApi(page: Page, username: string, password: string): Promise<string> {
    const response = await page.request.post(`${BASE_URL}/api/auth/login`, {
        data: { username, password },
        headers: { "Content-Type": "application/json" },
    });

    if (!response.ok()) {
        throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
    }

    const body = await response.json();
    const token = body.token as string;

    // Navigate to the app first so localStorage is accessible for the right origin
    await page.goto("/");
    // The app uses "notebooklm_token" as the localStorage key (see src/lib/auth.ts)
    await page.evaluate((t) => {
        localStorage.setItem("notebooklm_token", t);
    }, token);

    // Reload to apply auth state
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    return token;
}

/**
 * Register a new user via API, returning the token.
 * Silently ignores "already exists" errors (idempotent).
 */
export async function registerViaApi(
    page: Page,
    username: string,
    password: string,
): Promise<void> {
    const response = await page.request.post(`${BASE_URL}/api/auth/register`, {
        data: { username, password },
        headers: { "Content-Type": "application/json" },
    });
    // 400 = already registered — that's fine
    if (!response.ok() && response.status() !== 400) {
        const body = await response.text();
        console.warn(`Register returned ${response.status()}: ${body}`);
    }
}

/**
 * Delete all test projects that match the given prefix via API.
 */
export async function cleanupProjects(token: string, namePrefix: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const projects = (data.projects || []) as Array<{ id: number; name: string }>;
    for (const p of projects) {
        if (p.name.startsWith(namePrefix)) {
            await fetch(`${BASE_URL}/api/projects/${p.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
        }
    }
}
