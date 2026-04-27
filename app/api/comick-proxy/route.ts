import { NextRequest, NextResponse } from "next/server";

const COMICK_BASE = "https://comick-source-api.notaspider.dev";

/**
 * Proxy POST requests to the Comick Source API to bypass CORS.
 * Client calls /api/comick-proxy with { endpoint, body } and we forward it.
 */
export async function POST(request: NextRequest) {
  try {
    const { endpoint, body } = await request.json();

    if (!endpoint || typeof endpoint !== "string") {
      return NextResponse.json(
        { error: "Missing endpoint" },
        { status: 400 }
      );
    }

    // Whitelist of allowed endpoints
    const allowed = ["/api/search", "/api/chapters", "/api/frontpage", "/api/sources", "/api/health"];
    if (!allowed.includes(endpoint)) {
      return NextResponse.json(
        { error: "Endpoint not allowed" },
        { status: 403 }
      );
    }

    const res = await fetch(`${COMICK_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Upstream error: ${res.status}`, details: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Comick proxy error:", err);
    return NextResponse.json(
      { error: "Proxy error" },
      { status: 500 }
    );
  }
}

/**
 * Handle GET requests (for /api/sources, /api/health, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get("endpoint");

    if (!endpoint) {
      return NextResponse.json(
        { error: "Missing endpoint param" },
        { status: 400 }
      );
    }

    const allowed = ["/api/sources", "/api/health", "/api/frontpage"];
    if (!allowed.includes(endpoint)) {
      return NextResponse.json(
        { error: "Endpoint not allowed" },
        { status: 403 }
      );
    }

    const res = await fetch(`${COMICK_BASE}${endpoint}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Comick proxy GET error:", err);
    return NextResponse.json(
      { error: "Proxy error" },
      { status: 500 }
    );
  }
}
