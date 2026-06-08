import tseslint from "typescript-eslint";

const PII_MESSAGE =
  "Direct PII column read. Use readPii() from src/lib/db/pii-read.ts instead.";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "src/db/migrations/**",
      "infra/**",
      "worker/**",
      "extension/**",
      "next-env.d.ts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow _-prefixed identifiers as intentional "unused" markers
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Guard PII column reads — all four columns must go through readPii().
      // NOTE: This rule matches on the literal binding name only. Aliased or
      // destructured imports (e.g. `import { interviews as ivs }`) bypass the
      // rule. Full type-aware enforcement would require a custom TS-ESLint plugin.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.name='interviews'][property.name='transcript']",
          message: PII_MESSAGE,
        },
        {
          selector:
            "MemberExpression[object.name='imports'][property.name='rawPath']",
          message: PII_MESSAGE,
        },
        {
          selector:
            "MemberExpression[object.name='imports'][property.name='parsed']",
          message: PII_MESSAGE,
        },
        {
          selector:
            "MemberExpression[object.name='linkedinSnapshots'][property.name='rawHtml']",
          message: PII_MESSAGE,
        },
      ],
    },
  },
  {
    // pii-read.ts is the designated PII accessor — it must reference the PII
    // columns internally to build queries. All other files must call its exports.
    // This override must come after the general rule so flat-config precedence works.
    files: ["src/lib/db/pii-read.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
);
