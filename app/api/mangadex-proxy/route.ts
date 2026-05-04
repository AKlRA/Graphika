import { NextRequest, NextResponse } from "next/server";

const MANGADEX_BASE = "https://api.mangadex.org";
const UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * Proxy GET requests to MangaDex API to bypass ISP blocks.
 * Client calls /api/mangadex-proxy?path=/manga/xxx/feed&param1=val1&...
 * and we forward to api.mangadex.org.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path || typeof path !== "string") {
      return NextResponse.json(
        { error: "Missing 'path' parameter" },
        { status: 400 }
      );
    }

    // Rebuild query params (exclude our 'path' key)
    const upstreamParams = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) {
      if (key !== "path") {
        upstreamParams.append(key, value);
      }
    }

    const upstreamUrl = `${MANGADEX_BASE}${path}?${upstreamParams.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const res = await fetch(upstreamUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { error: `MangaDex upstream error: ${res.status}`, details: text },
          { status: res.status }
        );
      }

      const data = await res.json();
      return NextResponse.json(data);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error("MangaDex proxy error:", err);
    return NextResponse.json(
      { error: "MangaDex proxy error" },
      { status: 500 }
    );
  }
}
