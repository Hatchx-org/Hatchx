import type { NextConfig } from "next";

function configuredSupabaseSources() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const localDevelopment = process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) return { http: "", websocket: "" };
    return { http: url.origin, websocket: `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}` };
  } catch {
    return { http: "", websocket: "" };
  }
}

const supabaseSources = configuredSupabaseSources();

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "font-src 'self' data:",
  `img-src 'self' data: blob: https://*.supabase.co${supabaseSources.http ? ` ${supabaseSources.http}` : ""}`,
  `media-src 'self' https://*.supabase.co${supabaseSources.http ? ` ${supabaseSources.http}` : ""}`,
  `connect-src 'self' https://accounts.google.com/gsi/ https://*.supabase.co wss://*.supabase.co https://*.vercel-insights.com${supabaseSources.http ? ` ${supabaseSources.http}` : ""}${supabaseSources.websocket ? ` ${supabaseSources.websocket}` : ""}`,
  "frame-src 'self' https://accounts.google.com/gsi/",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Accept a 4 MiB photo plus multipart metadata, below Vercel's payload limit.
  experimental: { serverActions: { bodySizeLimit: "4.25mb" } },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async redirects() {
    return [
      { source: "/events/:path*", destination: "/calendar/:path*", permanent: true },
      {
        source: "/clubs/key-club-cfd268af",
        destination: "/clubs/key-club",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
