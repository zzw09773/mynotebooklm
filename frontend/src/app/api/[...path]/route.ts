import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://backend:8000";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const target = `${BACKEND_URL}/api/${path.join("/")}${request.nextUrl.search}`;
    const res = await fetch(target, {
        headers: Object.fromEntries(request.headers),
    });
    return new NextResponse(res.body, {
        status: res.status,
        headers: Object.fromEntries(res.headers),
    });
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

    const res = await fetch(target, {
        method: "POST",
        headers,
        body,
        // @ts-ignore
        duplex: "half",
    });

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
    const res = await fetch(target, {
        method: "DELETE",
        headers: Object.fromEntries(request.headers),
    });
    return new NextResponse(res.body, {
        status: res.status,
        headers: Object.fromEntries(res.headers),
    });
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

    const res = await fetch(target, {
        method: "PUT",
        headers,
        body,
    });
    return new NextResponse(res.body, {
        status: res.status,
        headers: Object.fromEntries(res.headers),
    });
}
