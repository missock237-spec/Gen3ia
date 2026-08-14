import { dirname } from "path";
import { fileURLToPath } from "url";
// Inline compat shim
const FlatCompat = class { constructor(opts: any) { this.baseDirectory = opts.baseDirectory; } };
import { globalIgnores } from "eslint/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

// En flat config (ESLint 9), l'option CLI `--ext` n'existe plus : les
// extensions à linter sont déclarées ici, via les patterns `files`.
const FILES = ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"];

const eslintConfig = [
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/playwright-report/**",
    "**/test-results/**",
    "**/.vercel/**",
    "public/**",
    "next-env.d.ts",
  ]),
  // Configs Next (core-web-vitals + typescript) appliquées aux fichiers TS/TSX/JS/JSX.
  // (FlatCompat étend les configs legacy : on s'assure que chaque bloc cible nos fichiers.)
  ...compat.extends("next/core-web-vitals", "next/typescript").map((cfg) => ({
    ...cfg,
    files: FILES,
  })),
  {
    files: FILES,
    rules: {
      // Résorption en cours : tout `any` explicite est un warning (ne bloque pas le lint).
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "react-hooks/exhaustive-deps": "warn",
      // STRICTE — ts-ignore interdit ; utiliser ts-expect-error avec justification.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": "allow-with-description", minimumDescriptionLength: 10 }
      ],
      // STRICTE — pas de console.* bruyants ; tout passer par le logger.
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
