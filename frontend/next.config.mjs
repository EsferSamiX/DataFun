/** @type {import('next').NextConfig} */
const nextConfig = {
  rewrites: async () => [
    { source: "/api/:path*", destination: "http://localhost:8000/api/:path*" },
    { source: "/auth/:path*", destination: "http://localhost:8000/auth/:path*" },
  ],
  experimental: {
    proxyTimeout: 300_000,
  },
}

export default nextConfig
