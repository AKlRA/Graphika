import { NextRequest, NextResponse } from "next/server";

const ANILIST_URL = "https://graphql.anilist.co";
const UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * Proxy POST requests to AniList GraphQL API to bypass ISP blocks.
 * Client sends the GraphQL query/variables as JSON body.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const res = await fetch(ANILIST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { error: `AniList upstream error: ${res.status}`, details: text },
          { status: res.status }
        );
      }

      const data = await res.json();
      return NextResponse.json(data);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error("AniList proxy error:", err);
    return NextResponse.json(
      { error: "AniList proxy error" },
      { status: 500 }
    );
  }
}
