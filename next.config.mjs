/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["mongodb"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};
export default nextConfig;
