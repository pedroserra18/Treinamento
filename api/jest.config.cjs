// Config em CommonJS (.cjs) pra o Jest não precisar de ts-node só pra ler a
// config. A transformação dos testes (.ts) continua via @swc/jest abaixo.
/** @type {import('jest').Config} */
module.exports = {
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
