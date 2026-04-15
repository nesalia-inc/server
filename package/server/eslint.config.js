import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import security from "eslint-plugin-security";
import importPlugin from "eslint-plugin-import";

const securityPlugin = security;
const importPluginResolved = importPlugin;

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  {
    ignores: [
      "node_modules",
      "dist",
      "build",
      ".turbo",
      "*.config.js",
      "**/*.test-d.ts",
      "tests",
      "vitest.config.ts",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["tests/**", "vitest.config.ts"],
    plugins: {
      security: securityPlugin,
      import: importPluginResolved,
      unicorn,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      // TypeScript Strict Rules
      "@typescript-eslint/consistent-return": ["error", { treatUndefinedAsUnspecified: true }],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-invalid-void-type": "error",
      "@typescript-eslint/unified-signatures": "warn",

      // Qualite du Code & Robustesse
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-floating-promises": "error",
      complexity: ["error", 15],
      "sonarjs/cognitive-complexity": ["error", 15],
      "@typescript-eslint/explicit-function-return-type": "off", // Too strict for this project
      "no-console": "error",
      "no-throw-literal": "error",

      // Performance
      "no-await-in-loop": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "unicorn/prefer-set-has": "error",
      "unicorn/prefer-at": "error",
      "no-useless-assignment": "error",

      // Import / Maintenance
      "import/no-unused-modules": "warn",
      "import/no-extraneous-dependencies": "error",
      "import/no-cycle": "error",
      "import/no-mutable-exports": "error",
      "import/extensions": ["warn", "always", { pattern: { ts: "never" } }],
      "import/consistent-type-specifier-style": ["warn", "prefer-inline"],
      // TODO: Enable when eslint-plugin-import is updated past 2.32.0 for ESLint 10.x compatibility
      // "import/order": ["warn", { "alphabetize": { "order": "asc" }, "newlines-between": "never" }],

      // Unicorn (sensible subset)
      "unicorn/better-regex": "off", // Breaks with complex regex
      "unicorn/catch-error-name": "warn",
      "unicorn/consistent-function-scoping": "off", // Too aggressive
      "unicorn/filename-case": "off", // Disabled for this project
      "unicorn/new-for-builtins": "warn",
      "unicorn/no-abusive-eslint-disable": "error",
      "unicorn/no-instanceof-array": "error",
      "unicorn/no-instanceof-builtins": "error",
      "unicorn/no-new-buffer": "error",
      "unicorn/no-unreadable-array-destructuring": "warn",
      "unicorn/no-zero-fractions": "error",
      "unicorn/number-literal-case": "error",
      "unicorn/prefer-add-event-listener": "warn",
      "unicorn/prefer-array-find": "error",
      "unicorn/prefer-includes": "error",
      "unicorn/prefer-modern-dom-apis": "error",
      "unicorn/prefer-negative-index": "error",
      "unicorn/prefer-node-protocol": "error",
      "unicorn/prefer-number-properties": "error",
      "unicorn/prefer-optional-catch-binding": "error",
      "unicorn/prefer-string-slice": "error",
      "unicorn/prefer-ternary": "off", // Ternaries can be harder to read
      "unicorn/throw-new-error": "error",

      // Security
      "security/detect-object-injection": "warn",
      "security/detect-unsafe-regex": "error",
      "security/detect-bidi-characters": "error",
      "security/detect-non-literal-regexp": "error",
      "security/detect-eval-with-expression": "error",

      // Security - SonarJS
      "sonarjs/no-hardcoded-secrets": "error",
      "sonarjs/no-os-command-from-path": "error",
      "sonarjs/hardcoded-secret-signatures": "error",
      "sonarjs/confidential-information-logging": "error",
      "sonarjs/code-eval": "error",

      // Existing rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],

      // SonarJS recommended (additional)
      "sonarjs/constructor-for-side-effects": "error",
      "sonarjs/no-empty-collection": "error",
      "sonarjs/no-useless-catch": "error",
      "sonarjs/prefer-promise-shorthand": "error",
      "sonarjs/no-collection-size-mischeck": "error",
      "sonarjs/no-delete-var": "error",
      "sonarjs/updated-loop-counter": "error",

      // SonarJS Recommended Rules (code quality)
      "sonarjs/array-callback-without-return": "error",
      "sonarjs/arguments-order": "error",
      "sonarjs/bitwise-operators": "error",
      "sonarjs/no-identical-expressions": "error",
      "sonarjs/no-redundant-jump": "error",
      "sonarjs/no-ignored-exceptions": "error",
      "sonarjs/prefer-single-boolean-return": "error",
      "sonarjs/no-duplicated-branches": "error",
      "sonarjs/no-identical-functions": "error",

      // SonarJS Recommended Rules (testing)
      "sonarjs/assertions-in-tests": "error",
      "sonarjs/no-skipped-tests": "error",

      // SonarJS Recommended Rules (deprecation tracking - requires type info)
      "sonarjs/deprecation": "warn",
    },
  }
);
