import "./src/config/env";
import type { NextConfig } from "next";

// Importing env above validates all required environment variables at
// build/startup time and throws if any are missing or invalid.

const nextConfig: NextConfig = {};

export default nextConfig;
