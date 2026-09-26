import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// A 0.0.0.0 listener does not automatically allow the LAN URL's HMR origin.
// Allow this machine's exact IPv4 addresses; refresh them on server startup.
const localHosts = Object.values(networkInterfaces()).flatMap((addresses) =>
  (addresses ?? [])
    .filter((address) => address.family === "IPv4")
    .map((address) => address.address),
);

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: [...new Set(["127.0.0.1", ...localHosts])],
};

export default nextConfig;
