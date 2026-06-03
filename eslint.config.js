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
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow _-prefixed identifiers as intentional "unused" markers
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Guard PII column reads — all four columns must go through readPii().
      // The column-level selectors below match only the literal binding name.
      // The alias-import selectors above this comment catch the bypass where
      // someone writes `import { interviews as ivs }` and then accesses
      // `ivs.transcript` (which the column rules would miss).
      "no-restricted-syntax": [
        "error",
        // Alias-import bypass guards — must appear before the column-level rules.
        {
          selector:
            "ImportDeclaration[source.value='@/db/schema'] ImportSpecifier[imported.name='interviews'][local.name!='interviews']",
          message:
            "Do not alias 'interviews' from '@/db/schema' — aliased names bypass the PII ESLint guard. Use the unaliased import and access columns through readPii().",
        },
        {
          selector:
            "ImportDeclaration[source.value='@/db/schema'] ImportSpecifier[imported.name='imports'][local.name!='imports']",
          message:
            "Do not alias 'imports' from '@/db/schema' — aliased names bypass the PII ESLint guard. Use the unaliased import and access columns through readPii().",
        },
        {
          selector:
            "ImportDeclaration[source.value='@/db/schema'] ImportSpecifier[imported.name='linkedinSnapshots'][local.name!='linkedinSnapshots']",
          message:
            "Do not alias 'linkedinSnapshots' from '@/db/schema' — aliased names bypass the PII ESLint guard. Use the unaliased import and access columns through readPii().",
        },
        // Column-level PII read guards.
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
