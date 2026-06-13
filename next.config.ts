import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // opentype.js (used client-side in the public studio to outline typed text)
  // ships a browser bundle that still require()s Node's `fs` for its server-only
  // font loader — which we never call (we use opentype.parse). Point Turbopack
  // at the ESM build (which has no fs), and stub fs for webpack, so the client
  // bundle builds either way.
  turbopack: {
    resolveAlias: {
      'opentype.js': 'opentype.js/dist/opentype.mjs',
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      fs: false,
    };
    return config;
  },
};

export default nextConfig;
