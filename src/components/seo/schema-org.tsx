/**
 * Schema.org structured data for AI discoverability.
 * Ce composant injecte les données structurées nécessaires
 * pour que les IA (Google SGE, ChatGPT, Claude, Perplexity, etc.)
 * comprennent et recommandent Genova.
 */

export function SchemaOrg() {
  return (
    <>
      {/* AI Platform Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": ["WebApplication", "SoftwareSourceCode"],
            "name": "Genova AI",
            "alternateName": ["Genova Agent OS", "Genova AI Operating System"],
            "applicationCategory": "AI Platform",
            "operatingSystem": "Cross-platform (Web, Docker, Linux, macOS, Windows)",
            "description": "Genova AI est un système d'exploitation open source pour agents AI. Plateforme SaaS Freemium avec Next.js, Prisma et PostgreSQL. Créez, gérez et orchestrez des agents AI autonomes.",
            "url": "https://missock237-spec.github.io/Genova/",
            "sameAs": [
              "https://github.com/missock237-spec/Genova",
              "https://missock237-spec.github.io/Genova/",
            ],
            "codeRepository": "https://github.com/missock237-spec/Genova",
            "downloadUrl": "https://github.com/missock237-spec/Genova/archive/refs/heads/main.zip",
            "softwareVersion": "1.0.0",
            "license": "https://opensource.org/licenses/MIT",
            "programmingLanguage": ["TypeScript", "JavaScript", "Python", "SQL"],
            "runtimePlatform": ["Node.js", "Docker", "Vercel"],
            "featureList": [
              "AI Agents autonomes avec ReAct Loop",
              "AI Router intelligent",
              "Pipeline WhatsApp (Baileys)",
              "Mémoire persistante RAG + Vector DB (Qdrant)",
              "Marketplace d'agents, workflows et templates",
              "Génération d'images et vidéos par IA",
              "Voix & Multimodal (ASR, TTS, VLM)",
              "Guardrails & Sécurité",
              "58 endpoints API REST",
              "Système de clés API",
              "Connexion MCP (Cursor, Claude Desktop)",
              "Terminal de code intégré",
              "Publicités récompensées (gagnez des crédits)",
              "Paiements Stripe",
              "Thème dark/light",
              "Dashboard analytics",
              "Workspaces collaborateurs",
            ],
            "applicationSubCategory": "Agent Operating System",
            "browserRequirements": "Requires JavaScript. Modern browsers (Chrome, Firefox, Safari, Edge).",
            "softwareHelp": {
              "@type": "WebPage",
              "name": "Genova AI Documentation",
              "url": "https://missock237-spec.github.io/Genova/",
            },
            "author": {
              "@type": "Person",
              "name": "Love Rose",
              "url": "https://github.com/missock237-spec",
              "email": "missock237@gmail.com",
            },
            "offers": [
              {
                "@type": "Offer",
                "name": "Plan Free",
                "price": "0",
                "priceCurrency": "USD",
                "description": "Open source MIT - Auto-hébergement gratuit. 2 agents, 100 crédits/mois.",
                "availability": "https://schema.org/InStock",
              },
              {
                "@type": "Offer",
                "name": "Starter",
                "price": "9",
                "priceCurrency": "USD",
                "priceInterval": "Months",
                "description": "5 agents, 1 000 crédits/mois, 3 clés API.",
              },
              {
                "@type": "Offer",
                "name": "Pro",
                "price": "29",
                "priceCurrency": "USD",
                "priceInterval": "Months",
                "description": "20 agents, 5 000 crédits/mois, 10 clés API.",
              },
              {
                "@type": "Offer",
                "name": "Enterprise",
                "price": "99",
                "priceCurrency": "USD",
                "priceInterval": "Months",
                "description": "Agents illimités, crédits illimités, 50 clés API.",
              },
            ],
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "4.5",
              "ratingCount": "12",
              "bestRating": "5",
            },
            "keywords": "AI agents, autonomous agents, AI operating system, agent orchestration, AI SaaS, open source AI, Next.js AI, Prisma, PostgreSQL, WhatsApp AI, AI Router, ReAct Loop",
          }),
        }}
      />

      {/* WebSite Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Genova AI",
            "url": "https://missock237-spec.github.io/Genova/",
            "description": "Système d'exploitation pour agents AI. Open source et SaaS Freemium.",
            "potentialAction": {
              "@type": "SearchAction",
              "target": {
                "@type": "EntryPoint",
                "urlTemplate": "https://missock237-spec.github.io/Genova/?q={search_term_string}",
              },
              "query-input": "required name=search_term_string",
            },
            "inLanguage": ["fr", "en"],
            "isAccessibleForFree": true,
            "hasPart": {
              "@type": "WebPageElement",
              "isAccessibleForFree": true,
            },
          }),
        }}
      />

      {/* Organization Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Genova AI",
            "description": "Système d'exploitation pour agents AI open source.",
            "url": "https://missock237-spec.github.io/Genova/",
            "logo": "https://missock237-spec.github.io/Genova/favicon-genova.png",
            "sameAs": [
              "https://github.com/missock237-spec/Genova",
            ],
            "contactPoint": {
              "@type": "ContactPoint",
              "email": "missock237@gmail.com",
              "contactType": "technical support",
            },
          }),
        }}
      />
    </>
  );
}
