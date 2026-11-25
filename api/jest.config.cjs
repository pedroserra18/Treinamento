// Config em CommonJS (.cjs) pra o Jest não precisar de ts-node só pra ler a
// config. A transformação dos testes (.ts) continua via @swc/jest abaixo.
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/tests/jest/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  setupFiles: ["<rootDir>/tests/jest/setup-env.ts"],
  // sanitize-html >=2.17.6 usa htmlparser2@12, que e ESM-only. Em producao o Node
  // (>=22.12) carrega via require(esm), mas o runtime do Jest nao: transpila essa
  // cadeia pra CommonJS com o mesmo @swc/jest.
  transformIgnorePatterns: [
    "/node_modules/(?!(htmlparser2|domutils|dom-serializer|domhandler|domelementtype|entities)/)"
  ],
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
