import { NextRequest, NextResponse } from "next/server";

/**
 * Image Proxy — streams images from external manga CDNs through our domain
 * to bypass CORS and Referer-based 403 blocks.
 *
 * Usage: GET /api/image-proxy?url=<encoded-image-url>&referer=<source-domain>
 *
 * Security:
 *  - Only proxies HTTPS URLs
 *  - Rejects responses > 15MB
 *  - Sets aggressive cache headers so Vercel Edge CDN caches images
 */

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Map source IDs to their base domain for the Referer header.
 * If a `referer` query param is provided it takes priority.
 */
const SOURCE_REFERERS: Record<string, string> = {
  comix: "https://comix.to/",
  mangakatana: "https://mangakatana.com/",
  weebcentral: "https://weebcentral.com/",
  asurascans: "https://asurascans.com/",
  flamecomics: "https://flamecomics.xyz/",
  mangacloud: "https://mangacloud.org/",
  mangadex: "https://mangadex.org/",
  mangapill: "https://mangapill.com/",
  mangakakalot: "https://mangakakalot.com/",
  manganato: "https://chapmanganato.to/",
  mangaplus: "https://mangaplus.shueisha.co.jp/",
  // Fallback used when source is unknown
  default: "https://comick.io/",
};

/**
 * MangaKakalot / Manganato CDNs enforce Referer matching the reader site.
 * Prefer the image hostname when the source family is ambiguous.
 */
function resolveReferer(imageUrl: string, sourceHint: string): string {
  let host = "";
  try {
    host = new URL(imageUrl).hostname.toLowerCase();
  } catch {
    return SOURCE_REFERERS[sourceHint] || SOURCE_REFERERS.default;
  }

  const hint = sourceHint.toLowerCase();

  // Image host heuristics — MangaKakalot / Manganato CDNs are strict about Referer
  if (
    hint === "manganato" ||
    hint === "mangakakalot" ||
    /manganato|chapmanganato|readmanganato/i.test(host)
  ) {
    if (/mangakakalot|kkcdn|mkklcdn/i.test(host)) {
      return "https://mangakakalot.com/";
    }
    return "https://chapmanganato.to/";
  }

  if (/mangakakalot|kkcdn|mkklcdn/i.test(host)) {
    return "https://mangakakalot.com/";
  }
  if (/manganato|chapmanganato|readmanganato/i.test(host)) {
    return "https://chapmanganato.to/";
  }

  return SOURCE_REFERERS[sourceHint] || SOURCE_REFERERS.default;
}

export const runtime = "edge"; // Use Edge Runtime for faster streaming + no 10s limit

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");
  const sourceHint = searchParams.get("source") || "default";

  if (!imageUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "Only HTTP(S) URLs allowed" }, { status: 400 });
  }

  // Block obvious private/local IPs
  const hostname = parsed.hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.") ||
    hostname === "0.0.0.0"
  ) {
    return NextResponse.json({ error: "Private URLs not allowed" }, { status: 403 });
  }

  // Determine Referer (image-host aware for Manganato / MangaKakalot CDNs)
  const referer = resolveReferer(imageUrl, sourceHint);

  try {
    const upstream = await fetch(imageUrl, {
      headers: {
        Referer: referer,
        Origin: referer.replace(/\/$/, ""),
        "User-Agent": DEFAULT_UA,
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: upstream.status }
      );
    }

    // Check content-length if available
    const contentLength = upstream.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const contentType =
      upstream.headers.get("content-type") || "image/jpeg";

    // Stream the response body directly
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        "Access-Control-Allow-Origin": "*",
        ...(contentLength ? { "Content-Length": contentLength } : {}),
      },
    });
  } catch (err) {
    console.error("Image proxy error:", err);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }
}
