module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
  ],
  rules: {
    "no-constant-condition": "error",
    "no-dupe-args": "error",
    "no-duplicate-case": "error",
    "no-sparse-arrays": "error",
    "no-unreachable": "error",
    "no-unsafe-finally": "error",
    "use-isnan": "error",
    "valid-typeof": "error",
    "@typescript-eslint/no-misused-new": "error",
    "@typescript-eslint/no-extra-non-null-assertion": "error",
  },
};
