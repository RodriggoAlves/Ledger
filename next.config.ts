import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Upload da fatura em PDF (máx. 5 MB) via server action.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
