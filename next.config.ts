import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/demo": ["./data/demo/**/*.md"],
  },
};

export default nextConfig;
