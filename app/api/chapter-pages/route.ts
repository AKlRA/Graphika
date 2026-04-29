import { NextRequest, NextResponse } from "next/server";

/**
 * Chapter Pages Scraper — fetches a chapter page from source sites and
 * extracts image URLs by parsing the HTML server-side.
 *
 * Usage: POST /api/chapter-pages  { url: string, source?: string }
 * Returns: { pages: string[], source: string }
 *
 * This runs on the Node.js runtime (not Edge) so we have full access to
 * text processing. The 10s Vercel limit is fine since we're only fetching
 * one HTML page and parsing it.
 */

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** Infer the source ID from a chapter URL if not provided */
function inferSource(url: string): string {
  const host = new URL(url).hostname.replace("www.", "");
  const map: Record<string, string> = {
    "mangakatana.com": "mangakatana",
    "weebcentral.com": "weebcentral",
    "comix.to": "comix",
    "asurascans.com": "asurascan",
    "flamecomics.xyz": "flamecomics",
    "mangacloud.org": "mangacloud",
    "mangapark.io": "mangapark",
    "bato.to": "bato",
    "mgeko.cc": "mgeko",
    "mangaread.org": "mangaread",
    "mangaloom.com": "mangaloom",
  };
  return map[host] || "unknown";
}

/** Get the Referer for a given source */
function getReferer(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/`;
  } catch {
    return "https://comick.io/";
  }
}

/**
 * Extract image URLs from chapter HTML.
 * Uses multiple strategies depending on the source site's HTML structure.
 */
function extractImages(html: string, source: string): string[] {
  const images: string[] = [];
  const seen = new Set<string>();

  const addImage = (url: string) => {
    // Clean up the URL
    let cleaned = url.trim().replace(/&amp;/g, "&");
    if (!cleaned) return;
    // Must be an absolute URL or protocol-relative
    if (cleaned.startsWith("//")) cleaned = "https:" + cleaned;
    if (!cleaned.startsWith("http")) return;
    // Skip tiny icons, avatars, logos
    if (/\.(ico|svg)(\?|$)/i.test(cleaned)) return;
    if (/logo|icon|avatar|banner|thumb|favicon/i.test(cleaned)) return;
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      images.push(cleaned);
    }
  };

  // ── Strategy 1: Look for common manga reader JavaScript arrays ──
  // Many sites embed image URLs in a JS variable like:
  // var ytaw = ['url1','url2',...];
  // var thzq = [...];
  // or data_url = "url1,url2,..."
  const jsArrayPatterns = [
    // mangakatana uses: var ytaw = ['...', '...'];
    /var\s+\w+\s*=\s*\[([^\]]{100,})\]/g,
    // some sites use: var images = ["...", "..."];
    /(?:images|pages|chapter_images|lstImages)\s*=\s*\[([^\]]{100,})\]/gi,
  ];

  for (const pattern of jsArrayPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const arrayContent = match[1];
      // Extract quoted strings from the array
      const urlMatches = arrayContent.match(/['"]([^'"]+)['"]/g);
      if (urlMatches && urlMatches.length > 0) {
        const urls = urlMatches.map((s) => s.slice(1, -1));
        // Only use if most look like image URLs
        const imageUrls = urls.filter((u) =>
          /\.(jpg|jpeg|png|gif|webp|avif)/i.test(u) || /\/manga\//i.test(u) || u.includes("cdn")
        );
        if (imageUrls.length >= 2) {
          imageUrls.forEach(addImage);
          if (images.length > 0) return images;
        }
      }
    }
  }

  // ── Strategy 2: <img> tags inside reader containers ──
  // Common container class names / IDs
  const containerPatterns = [
    /class\s*=\s*["'][^"']*(?:reading-content|chapter-content|reader-area|page-break|chapter-img|wp-manga-chapter-img|image-container|chapter_img|reading-detail|pages-container)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
    /id\s*=\s*["'](?:content|vungdoc|chapter-content|image-container|all|viewer|longstrip)["'][^>]*>([\s\S]*?)<\/div>/gi,
  ];

  for (const pattern of containerPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const containerHtml = match[1] || match[0];
      // Find img tags in this container
      const imgPattern = /<img[^>]+(?:src|data-src|data-lazy-src|data-url)\s*=\s*["']([^"']+)["'][^>]*>/gi;
      let imgMatch;
      while ((imgMatch = imgPattern.exec(containerHtml)) !== null) {
        addImage(imgMatch[1]);
      }
    }
    if (images.length >= 2) return images;
  }

  // ── Strategy 3: Broad <img> scan with image URL heuristic ──
  // Find all img tags with data-src or src that look like manga page images
  const broadImgPattern =
    /<img[^>]+(?:data-src|data-lazy-src|data-url|src)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let imgMatch;
  const candidateUrls: string[] = [];
  while ((imgMatch = broadImgPattern.exec(html)) !== null) {
    const url = imgMatch[1].trim();
    if (url && /\.(jpg|jpeg|png|gif|webp|avif)/i.test(url)) {
      candidateUrls.push(url);
    }
  }

  // Filter to likely manga pages: same domain, sequential, or large-sounding paths
  if (candidateUrls.length >= 3) {
    // Group by domain to find the dominant image CDN
    const domains = new Map<string, string[]>();
    for (const u of candidateUrls) {
      try {
        const host = new URL(u.startsWith("//") ? "https:" + u : u).hostname;
        if (!domains.has(host)) domains.set(host, []);
        domains.get(host)!.push(u);
      } catch { /* skip */ }
    }

    // Pick the domain with the most images (that's likely the manga pages)
    let bestGroup: string[] = [];
    for (const group of domains.values()) {
      if (group.length > bestGroup.length) bestGroup = group;
    }

    if (bestGroup.length >= 3) {
      bestGroup.forEach(addImage);
      if (images.length >= 3) return images;
    }
  }

  // ── Strategy 4: Last resort — look for all http image URLs in the HTML ──
  const urlPattern = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^\s"'<>]*)?/gi;
  let urlMatch;
  const allImageUrls: string[] = [];
  while ((urlMatch = urlPattern.exec(html)) !== null) {
    allImageUrls.push(urlMatch[0]);
  }

  // Same domain grouping trick
  if (allImageUrls.length >= 3) {
    const domains = new Map<string, string[]>();
    for (const u of allImageUrls) {
      try {
        const host = new URL(u).hostname;
        if (!domains.has(host)) domains.set(host, []);
        domains.get(host)!.push(u);
      } catch { /* skip */ }
    }
    let bestGroup: string[] = [];
    for (const group of domains.values()) {
      if (group.length > bestGroup.length) bestGroup = group;
    }
    if (bestGroup.length >= 3) {
      // Deduplicate while preserving order
      bestGroup.forEach(addImage);
    }
  }

  return images;
}

export async function POST(request: NextRequest) {
  try {
    const { url, source: sourceHint } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    // Validate URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return NextResponse.json({ error: "Only HTTP(S) URLs" }, { status: 400 });
    }

    const source = sourceHint || inferSource(url);
    const referer = getReferer(url);

    // Fetch the chapter page HTML
    const res = await fetch(url, {
      headers: {
        "User-Agent": DEFAULT_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: referer,
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Source returned ${res.status}`, source },
        { status: res.status }
      );
    }

    const html = await res.text();
    const pages = extractImages(html, source);

    return NextResponse.json(
      { pages, source, count: pages.length },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
      }
    );
  } catch (err) {
    console.error("Chapter pages scraper error:", err);
    return NextResponse.json(
      { error: "Scraper error" },
      { status: 500 }
    );
  }
}
