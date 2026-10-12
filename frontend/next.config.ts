import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

/**
 * Security headers for every page. The API lives on the same origin in
 * production (the load balancer routes /api/* to the backend), so connect-src
 * only needs 'self' there; in local development the API runs on its own port.
 */
const apiOrigin = (() => {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";
  try {
    return base.startsWith("http") ? new URL(base).origin : "";
  } catch {
    return "";
  }
})();

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Monorepo: trace files from the workspace root so the standalone build is complete.
  outputFileTracingRoot: fileURLToPath(new URL("..", import.meta.url)),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
