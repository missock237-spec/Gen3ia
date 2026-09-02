import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // v3.2 — audit qualité : le typage strict (tsconfig strict:true) doit FAIRE
  // ÉCHOUER le build en cas d'erreur de type. Aucune erreur ne passe en prod.
  typescript: {
    ignoreBuildErrors: false,
  },
  // v3.2 — React StrictMode : détecte les effets non idempotents et les API
  // dépréciées dès le développement (React 19 affiche tous les warnings).
  reactStrictMode: true,
};

export default nextConfig;
