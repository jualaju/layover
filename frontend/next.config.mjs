/** @type {import('next').NextConfig} */
const config = {
  output: process.env.RENDEZVOUS_STANDALONE === "1" ? "standalone" : undefined,
  turbopack: { root: new URL(".", import.meta.url).pathname },
  // The compiler API avoids a CLI subprocess limitation in restricted hosts.
  experimental: { cpus: 2, useTypeScriptCli: false },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
    ] }];
  },
};
export default config;
