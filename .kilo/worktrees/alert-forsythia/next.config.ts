import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // A conservative CSP: locks down framing, base URI, plugins and form targets
  // without restricting scripts/styles (which would need Next nonces and risk
  // breaking hydration). Defense-in-depth on top of React's own escaping.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      "connect-src 'self' https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // The invoice reader compiles WebAssembly served from this app; its
      // runtime may also start a worker of its own.
      "worker-src 'self' blob:",
      "font-src 'self' data:",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@libsql/client", "exceljs", "web-push"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  webpack: (config, { isServer }) => {
    // The invoice reader runs PaddleOCR on WebAssembly. onnxruntime-web's
    // default build also carries the WebGPU path, which loads a different,
    // far larger .wasm — 28 MB we would have to serve for a feature that asks
    // for the plain WebAssembly backend anyway. Pointing at the wasm-only
    // build keeps it to the one file scripts/copy-ort.mjs puts in public/ort.
    config.resolve.alias = {
      ...config.resolve.alias,
      "onnxruntime-web$": "onnxruntime-web/wasm",
    };
    if (!isServer) {
      // OpenCV (which straightens the photographed page) ships one file for
      // every environment it can run in, Node included. Its Node half asks for
      // `fs`, which a browser has no answer for; telling the bundler so is
      // what lets the browser half through.
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    }
    return config;
  },
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Don't run the service worker in dev — avoids caching churn while developing.
  disable: process.env.NODE_ENV === "development",
  // The offline notice has to be in the precache as a page, not just as the
  // script that renders it: it is what a navigation falls back to when there
  // is no connection and nothing cached, and at that moment there is nothing
  // to fetch it with. The revision changes per build so it never goes stale.
  additionalPrecacheEntries: [
    { url: "/offline", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
  ],
});

export default withSerwist(nextConfig);
