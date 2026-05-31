import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd(), "../.."),
  },
  async rewrites() {
    return [
      // curl -fsSL https://getcomposer.dev/install.sh | bash
      { source: "/install.sh", destination: "/api/install" },
      { source: "/install", destination: "/api/install" },
      // brew install https://getcomposer.dev/homebrew/composer.rb
      { source: "/homebrew/composer.rb", destination: "/api/homebrew" },
    ];
  },
};

export default nextConfig;
