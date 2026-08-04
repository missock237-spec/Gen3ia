import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  // Ignore patterns
  {
    ignores: [
      "node_modules/",
      ".next/",
      "dist/",
      "build/",
      "coverage/",
      ".turbo/",
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/*.test.tsx",
      "**/*.spec.tsx",
    ],
  },
  // Extend Next.js and TypeScript configs
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    rules: {
      // TypeScript strict rules
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        { "ts-ignore": "allow-with-description", minimumDescriptionLength: 5 },
      ],
      // React and hooks
      "react-hooks/exhaustive-deps": "warn",
      "react/display-name": "warn",
      // Code quality
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["warn", "always"],
      "curly": ["warn", "all"],
      "no-throw-literal": "warn",
      "prefer-template": "warn",
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    // Exception: Logger files are allowed to use console
    files: ["src/lib/logger.ts", "src/lib/error-handling/*.ts", "packages/core/src/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Test files - relaxed rules
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
];

export default eslintConfig;
