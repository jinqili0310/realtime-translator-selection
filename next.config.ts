import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // !! WARN !!
    // Ignoring TypeScript errors during build
    // This is not recommended unless you're aware of the implications
    ignoreBuildErrors: true,
  },
  eslint: {
    // !! WARN !!
    // Ignoring ESLint errors during build
    // This is not recommended for production code quality
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
