import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // STRICTE — tout `any` explicite est une erreur (résorption en cours).
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "react-hooks/exhaustive-deps": "warn",
      // STRICTE — ts-ignore interdit ; utiliser ts-expect-error avec justification.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": "allow-with-description", minimumDescriptionLength: 10 }
      ],
      // STRICTE — pas de console.* bruиs ; tout passer par le logger.
      "no-console": ["error", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    // Exemption unique : src/lib/logger.ts est le TRANSPORT de log vers la console/Loki.
    // C'est le seul endroit légitime où écrire sur process.stdout/console.
    files: ["src/lib/logger.ts", "packages/core/src/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
