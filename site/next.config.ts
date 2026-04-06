import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/pricing",
        destination: "/",
        permanent: true,
      },
      {
        source: "/how-it-works",
        destination: "/#how-it-works",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
