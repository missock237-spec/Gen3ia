import { siteConfig } from "./config";

export function JsonLd() {
  const schemas = [
    // 1. SoftwareApplication (pour les stores et moteurs de recherche)
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Gen3ia",
      applicationCategory: "AIApplication",
      operatingSystem: "Web",
      description:
        "Gen3ia est la plateforme SaaS qui vous permet de créer, gérer et coordonner vos agents IA. Outils, automatisation, ReAct Loop, Marketplace.",
      url: siteConfig.url,
      image: `${siteConfig.url}/og-image.png`,
      author: {
        "@type": "Organization",
        name: "Gen3ia",
        url: siteConfig.url,
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "XAF",
        availability: "https://schema.org/InStock",
      },
      featureList: [
        "Agents IA autonomes avec ReAct Loop",
        "Appels vocaux avec voix humaine (Twilio)",
        "Outils et actions personnalisables",
        "Marketplace d'agents",
        "Billing adapté à l'Afrique",
        "Multimodal (texte, image, vidéo)",
      ],
      softwareVersion: "0.1.0",
      countriesSupported: "CM, CI, SN, MA, DZ, TN, FR, CA, BE, CH",
      availableOnDevice: "Desktop, Mobile, Web",
    },

    // 2. Organization (pour les knowledge panels Google)
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Gen3ia",
      url: siteConfig.url,
      logo: `${siteConfig.url}/favicon-gen3ia.png`,
      description:
        "Système d'exploitation pour agents IA. Créez, gérez et coordonnez vos agents intelligents.",
      foundingDate: "2026-05-29",
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "support",
          email: "contact@gen3ia.online",
          availableLanguage: ["French", "English"],
        },
      ],
    },

    // 3. WebSite (search action pour Google Sitelinks Search Box)
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Gen3ia",
      url: siteConfig.url,
      description:
        "Plateforme SaaS de création et gestion d'agents IA.",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteConfig.url}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },

    // 4. FAQPage (questions frequentes pour les featured snippets)
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Qu'est-ce que Gen3ia ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Gen3ia est un système d'exploitation pour agents IA. Une plateforme SaaS qui permet de créer, gérer et coordonner des agents intelligents capables d'exécuter des tâches, passer des appels vocaux, et bien plus.",
          },
        },
        {
          "@type": "Question",
          name: "Gen3ia est-il gratuit ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Oui, Gen3ia propose un plan gratuit avec 1000 crédits. Les plans payants (Starter, Pro, Enterprise) offrent plus de crédits et des fonctionnalités avancées comme les pubs récompensées.",
          },
        },
        {
          "@type": "Question",
          name: "Peut-on passer des appels téléphoniques avec Gen3ia ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Oui ! Les agents vocaux Gen3ia peuvent passer et recevoir des appels téléphoniques avec une voix naturelle, comprendre le langage parlé et répondre intelligemment via Twilio.",
          },
        },
        {
          "@type": "Question",
          name: "Quels fournisseurs LLM sont supportés ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Gen3ia supporte OpenAI (GPT-4o), Anthropic (Claude), Groq (LLaMA) et OpenRouter avec bascule automatique en cas de panne.",
          },
        },
      ],
    },

    // 5. BreadcrumbList
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Accueil",
          item: siteConfig.url,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Agents IA",
          item: `${siteConfig.url}/terminal`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Voix",
          item: `${siteConfig.url}/studio`,
        },
      ],
    },
  ];

  return schemas.map((schema, index) => (
    <script
      key={index}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  ));
}
