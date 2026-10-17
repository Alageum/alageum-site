import { deploymentMode } from './lib/deployment/config.js';
import { browserApiRewrites } from "./lib/api/browserProxy.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the static-default interruption test build separate from the live
  // API-default application build. Both are real production Next builds.
  distDir: process.env.ALAGEUM_MEMBER_BUILD === "1" ? ".next-member" : process.env.ALAGEUM_DOCUMENT_BUILD === "1" ? ".next-document" : process.env.ALAGEUM_INVOICE_BUILD === "1" ? ".next-invoice" : process.env.ALAGEUM_ORDERS_BUILD === "1" ? ".next-orders" : process.env.ALAGEUM_SUPPORT_BUILD === "1" ? ".next-support" : process.env.ALAGEUM_ORGANIZATION_BUILD === "1" ? ".next-organization" : process.env.ALAGEUM_PROFILE_BUILD === "1" ? ".next-profile" : process.env.ALAGEUM_QUOTES_BUILD === "1" ? ".next-quotes" : ".next",
  allowedDevOrigins: ["127.0.0.1", "192.168.123.4"],
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() { return browserApiRewrites(); },
};

export default async function config(phase) {
  if (phase === PHASE_PRODUCTION_BUILD || phase === PHASE_DEVELOPMENT_SERVER) await verifySourceContextBuild();
  const mode = deploymentMode();
  return { ...nextConfig, env: { NEXT_PUBLIC_SITE_MODE: mode } }; 
}
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants.js';
import { verifySourceContextBuild } from './scripts/verify-source-context-build.mjs';
