import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://backend:8000";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params;
    const target = `${BACKEND_URL}/thumbnails/${path.join("/")}`;
    const res = await fetch(target);
    return new NextResponse(res.body, {
        status: res.status,
        headers: Object.fromEntries(res.headers),
    });
}
