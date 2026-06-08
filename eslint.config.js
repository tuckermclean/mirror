import tseslint from "typescript-eslint";

const PII_MESSAGE =
  "Direct PII column read. Use readPii() from src/lib/db/pii-read.ts instead.";

// Aliasing a PII table on import (e.g. `import { interviews as ivs }`) renames
// the binding so the literal `object.name` member-expression selectors below no
// longer match `ivs.transcript`. We cannot follow the alias in a purely
// syntactic rule, so we forbid the alias itself: the PII tables must be imported
// under their canonical names, which keeps the member-access guards effective.
// pii-read.ts is exempted by the file override at the bottom of this config.
const PII_TABLES = ["interviews", "imports", "linkedinSnapshots"];
const aliasedPiiImportSelectors = PII_TABLES.map((table) => ({
  selector: `ImportSpecifier[imported.name='${table}'][local.name!='${table}']`,
  message:
    `Aliased import of PII table '${table}'. Import it under its canonical ` +
    `name and read PII columns via readPii() from src/lib/db/pii-read.ts.`,
}));

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
      // The MemberExpression selectors below match the canonical binding names;
      // the aliasedPiiImportSelectors (added at the end) forbid renaming a PII
      // table on import so the canonical-name guards cannot be bypassed. Reads
      // through a destructured row object are still not caught here — full
      // type-aware enforcement would require a custom TS-ESLint plugin.
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
        ...aliasedPiiImportSelectors,
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
