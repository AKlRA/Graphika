import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "s4.anilist.co",
      },
      {
        protocol: "https",
        hostname: "img.anilist.co",      
      },
      {
        protocol: "https",
        hostname: "media.kitsu.app",
      },
      {
        protocol: "https",
        hostname: "uploads.mangadex.org",
      },
      {
        protocol: "https",
        hostname: "mangadex.org",
      },
      {
        protocol: "https",
        hostname: "**.mangadex.network",
      },
      {
        protocol: "https",
        hostname: "comix.to",
      },
      {
        protocol: "https",
        hostname: "meo.comick.pictures",
      },
    ],
  },
};

export default nextConfig;
