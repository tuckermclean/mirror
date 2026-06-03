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
      // The member-expression selectors catch direct access by the canonical
      // binding name. The ImportSpecifier selectors catch aliased imports (e.g.
      // `import { interviews as ivs }`) that would otherwise bypass the member
      // expression check by renaming the binding at import time.
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
        {
          selector:
            "ImportDeclaration[source.value='@/db/schema'] > ImportSpecifier[imported.name='interviews'][local.name!='interviews']",
          message:
            "PII guard: do not alias the 'interviews' import — aliased names bypass the no-restricted-syntax PII check.",
        },
        {
          selector:
            "ImportDeclaration[source.value='@/db/schema'] > ImportSpecifier[imported.name='imports'][local.name!='imports']",
          message:
            "PII guard: do not alias the 'imports' import — aliased names bypass the no-restricted-syntax PII check.",
        },
        {
          selector:
            "ImportDeclaration[source.value='@/db/schema'] > ImportSpecifier[imported.name='linkedinSnapshots'][local.name!='linkedinSnapshots']",
          message:
            "PII guard: do not alias the 'linkedinSnapshots' import — aliased names bypass the no-restricted-syntax PII check.",
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
