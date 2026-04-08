import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/tests/jest/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  setupFiles: ["<rootDir>/tests/jest/setup-env.ts"],
  transform: {
    "^.+\\.(t|j)s$": [
      "@swc/jest",
      {
        jsc: {
          target: "es2022",
          parser: {
            syntax: "typescript"
          }
        },
        module: {
          type: "commonjs"
        }
      }
    ]
  }
};

export default config;