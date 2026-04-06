module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "chore", "docs", "style", "refactor", "perf", "test", "build", "ci", "revert"]
    ],
    "scope-case": [2, "always", "kebab-case"],
    "subject-empty": [2, "never"]
  }
};
