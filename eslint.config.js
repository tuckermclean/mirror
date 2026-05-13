import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "src/db/migrations/**",
      "infra/**",
      "worker/**",
      "extension/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow _-prefixed identifiers as intentional "unused" markers
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
