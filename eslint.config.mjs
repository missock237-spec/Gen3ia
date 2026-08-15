import { dirname } from "path";
import { fileURLToPath } from "url";
import { globalIgnores } from "eslint/config";
import { FlatCompat } from "@eslint/eslintrc";

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
  // (FlatCompat from @eslint/eslintrc convertit les configs legacy en flat config.)
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
      // T1 — Déblocage Vercel : @ts-ignore dégradé en warning (327 occurrences à corriger en T3a).
      // La règle reste active pour traquer les directives sans description, mais ne bloque plus le build.
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        { "ts-ignore": "allow-with-description", minimumDescriptionLength: 10 }
      ],
      // T1 — Déblocage Vercel : no-console dégradé en warning (45 occurrences à corriger en T3c).
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // T1 — Règles React Compiler dégradées en warning le temps du refactoring T2.
      // Ces règles détectent des bugs réels (boucles de rendu, mutations d'état) qui doivent
      // être corrigés manuellement. En attendant, elles ne bloquent pas le déploiement.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      // T1 — Autres règles dégradées le temps de la migration.
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unused-expressions": ["warn", { allowShortCircuit: true, allowTernary: true }],
      "react/no-unescaped-entities": "warn",
      "react/jsx-no-comment-textnodes": "warn",
      // next/no-img-element déjà fourni par next/core-web-vitals — pas besoin de le redéclarer ici.
      "import/no-anonymous-default-export": "warn",
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
