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
      // Aliased imports (e.g. `import { interviews as ivs }`) are also caught
      // via ImportSpecifier selectors below; renaming bypass is a compile error.
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
          // Catch aliased imports of the `interviews` table binding, e.g.
          // `import { interviews as ivs } from "@/db/schema"` — the member-expression
          // rule above only fires on the literal name "interviews".
          selector:
            "ImportDeclaration[source.value=/@\\/db\\/schema/] > ImportSpecifier[imported.name='interviews'][local.name!='interviews']",
          message:
            "Do not alias the `interviews` schema import — aliasing bypasses the PII member-expression guard.",
        },
        {
          // Catch aliased imports of the `imports` table binding.
          selector:
            "ImportDeclaration[source.value=/@\\/db\\/schema/] > ImportSpecifier[imported.name='imports'][local.name!='imports']",
          message:
            "Do not alias the `imports` schema import — aliasing bypasses the PII member-expression guard.",
        },
        {
          // Catch aliased imports of the `linkedinSnapshots` table binding.
          selector:
            "ImportDeclaration[source.value=/@\\/db\\/schema/] > ImportSpecifier[imported.name='linkedinSnapshots'][local.name!='linkedinSnapshots']",
          message:
            "Do not alias the `linkedinSnapshots` schema import — aliasing bypasses the PII member-expression guard.",
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
