import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "api/**",
    "frontend-vite/**",
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**"
  ])
]);
