import { NextRequest, NextResponse } from "next/server";

// Allow long-running LLM / streaming requests (Next.js route segment config)
export const maxDuration = 300;

const BACKEND_URL = process.env.BACKEND_URL || "http://backend:8000";

// Timeout for proxy fetch calls — 5 minutes to accommodate slow LLM responses
const PROXY_TIMEOUT_MS = 5 * 60 * 1000;

function proxySignal(): AbortSignal {
    return AbortSignal.timeout(PROXY_TIMEOUT_MS);
}

function gatewayError(cause: unknown): NextResponse {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return new NextResponse(JSON.stringify({ detail: `Proxy error: ${msg}` }), {
        status: 504,
        headers: { "Content-Type": "application/json" },
    });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const target = `${BACKEND_URL}/api/${path.join("/")}${request.nextUrl.search}`;
    try {
        const res = await fetch(target, {
            headers: Object.fromEntries(request.headers),
            signal: proxySignal(),
        });
        return new NextResponse(res.body, {
            status: res.status,
            headers: Object.fromEntries(res.headers),
        });
    } catch (err) {
        return gatewayError(err);
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const target = `${BACKEND_URL}/api/${path.join("/")}${request.nextUrl.search}`;

    const contentType = request.headers.get("content-type") || "";
    let body: any;

    if (contentType.includes("multipart/form-data")) {
        body = await request.arrayBuffer();
    } else {
        body = await request.text();
    }

    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => {
        if (k !== "host" && k !== "content-length") headers[k] = v;
    });

    let res: Response;
    try {
        res = await fetch(target, {
            method: "POST",
            headers,
            body,
            signal: proxySignal(),
            // @ts-ignore
            duplex: "half",
        });
    } catch (err) {
        return gatewayError(err);
    }

    // For SSE / streaming responses, set proper headers
    const resContentType = res.headers.get("content-type") || "";
    const responseHeaders = new Headers();
    res.headers.forEach((v, k) => {
        // Skip hop-by-hop headers that conflict with Next.js chunked encoding
        if (k !== "transfer-encoding" && k !== "content-length" && k !== "connection") {
            responseHeaders.set(k, v);
        }
    });

    if (resContentType.includes("text/event-stream")) {
        responseHeaders.set("Content-Type", "text/event-stream");
        responseHeaders.set("Cache-Control", "no-cache, no-transform");
        responseHeaders.set("Connection", "keep-alive");
        responseHeaders.set("X-Accel-Buffering", "no");
    }

    return new NextResponse(res.body, {
        status: res.status,
        headers: responseHeaders,
    });
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const target = `${BACKEND_URL}/api/${path.join("/")}${request.nextUrl.search}`;
    try {
        const res = await fetch(target, {
            method: "DELETE",
            headers: Object.fromEntries(request.headers),
            signal: proxySignal(),
        });
        return new NextResponse(res.body, {
            status: res.status,
            headers: Object.fromEntries(res.headers),
        });
    } catch (err) {
        return gatewayError(err);
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const target = `${BACKEND_URL}/api/${path.join("/")}${request.nextUrl.search}`;
    const body = await request.text();

    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => {
        if (k !== "host" && k !== "content-length") headers[k] = v;
    });

    try {
        const res = await fetch(target, { method: "PUT", headers, body, signal: proxySignal() });
        return new NextResponse(res.body, {
            status: res.status,
            headers: Object.fromEntries(res.headers),
        });
    } catch (err) {
        return gatewayError(err);
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const target = `${BACKEND_URL}/api/${path.join("/")}${request.nextUrl.search}`;
    const body = await request.text();

    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => {
        if (k !== "host" && k !== "content-length") headers[k] = v;
    });

    try {
        const res = await fetch(target, { method: "PATCH", headers, body, signal: proxySignal() });
        return new NextResponse(res.body, {
            status: res.status,
            headers: Object.fromEntries(res.headers),
        });
    } catch (err) {
        return gatewayError(err);
    }
}
