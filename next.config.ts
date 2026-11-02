import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // FleetPilot is a fully authenticated, per-request app, so it does not use
  // Cache Components / static-shell prerendering (the scaffold enabled both).
  cacheComponents: false,
  partialPrefetching: false,
  // PGlite ships WASM + data files that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
