import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", ".next-member/**", ".next-invoice/**", ".next-document/**", ".next-support/**", ".next-orders/**", ".next-quotes/**", ".next-profile/**", ".next-organization/**", ".preview-build/**", "preview-dist/**", "playwright-report/**", "test-results/**"]),
]);
