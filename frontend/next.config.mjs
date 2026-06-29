/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Proxy /api/* to the backend so the browser talks to one origin in dev.
  async rewrites() {
    const backend =
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://nexusllm-3x5q.onrender.com"
        : "http://localhost:8080");
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/:path*`,
      },
      // Proxy the OpenAI-compatible API too, so the displayed base URL
      // (https://<frontend-host>/v1) actually works as a drop-in base_url for
      // external agents/SDKs — not just the in-app playground.
      {
        source: "/v1/:path*",
        destination: `${backend}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
