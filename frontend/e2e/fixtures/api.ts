import { BASE_URL } from "./auth";

/**
 * Get the project ID for a project by exact name.
 * Retries up to 3 times (500 ms apart) to tolerate brief DB propagation delays.
 */
export async function getProjectIdByName(token: string, name: string): Promise<number | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`${BASE_URL}/api/projects`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const data = await res.json();
            const project = (data.projects || []).find(
                (p: { id: number; name: string }) => p.name === name,
            );
            if (project) return project.id;
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    return null;
}

/**
 * Create a conversation in the given project via API.
 */
export async function createConversationViaApi(
    token: string,
    projectId: number,
    title: string,
): Promise<{ id: number; title: string }> {
    const res = await fetch(`${BASE_URL}/api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: projectId, title }),
    });
    if (!res.ok) throw new Error(`Create conversation failed: ${res.status} ${await res.text()}`);
    return res.json();
}

/**
 * Add a message to a conversation via API.
 */
export async function addMessageViaApi(
    token: string,
    conversationId: number,
    role: "user" | "assistant",
    content: string,
): Promise<void> {
    const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role, content }),
    });
    if (!res.ok) {
        console.warn(`addMessageViaApi returned ${res.status}: ${await res.text()}`);
    }
}

/**
 * Get all studio artifacts for a project.
 * Throws on non-OK response so test failures are diagnosable.
 */
export async function getStudioArtifacts(
    token: string,
    projectId: number,
): Promise<Array<{ artifact_type: string; status: string }>> {
    const res = await fetch(`${BASE_URL}/api/studio/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok)
        throw new Error(`GET /api/studio/${projectId} failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.artifacts ?? data;
}

/**
 * Trigger studio artifact generation for a project.
 * Throws on non-OK response so test failures are diagnosable.
 */
export async function triggerStudioGenerate(
    token: string,
    projectId: number,
    artifactType: string,
    force = false,
): Promise<{ artifact_type: string; status: string }> {
    const res = await fetch(
        `${BASE_URL}/api/studio/${projectId}/${artifactType}/generate?force=${force}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        },
    );
    if (!res.ok)
        throw new Error(
            `POST /api/studio/${projectId}/${artifactType}/generate failed: ${res.status} ${await res.text()}`,
        );
    return res.json();
}
