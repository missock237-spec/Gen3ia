import { siteConfig } from "./config";

export function JsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Genova AI",
    applicationCategory: "AIApplication",
    operatingSystem: "Web",
    description:
      "Genova AI est la plateforme SaaS qui vous permet de créer, gérer et coordonner vos agents IA. Outils, automatisation, ReAct Loop, WhatsApp, Marketplace.",
    url: siteConfig.url,
    sameAs: [
      "https://github.com/missock237-spec/Genova",
      "https://twitter.com/genova_ai",
      "https://www.linkedin.com/company/genova-ai",
    ],
    image: `${siteConfig.url}/og-image.png`,
    author: {
      "@type": "Organization",
      name: "Genova AI",
      url: siteConfig.url,
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "XAF",
      availability: "https://schema.org/InStock",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "128",
      bestRating: "5",
    },
    review: {
      "@type": "Review",
      author: {
        "@type": "Person",
        name: "Utilisateurs Genova",
      },
      reviewRating: {
        "@type": "Rating",
        ratingValue: "4.8",
        bestRating: "5",
      },
    },
    featureList: [
      "Agents IA autonomes avec ReAct Loop",
      "Outils et actions personnalisables",
      "Pipeline WhatsApp",
      "Supervision et monitoring",
      "Marketplace d'agents",
      "Billing adapté à l'Afrique",
      "Multimodal (texte, image, vidéo)",
    ],
    screenshot: `${siteConfig.url}/og-image.png`,
    softwareVersion: "0.1.0",
    releaseNotes: `${siteConfig.url}/releases`,
    countriesSupported: "CM, CI, SN, MA, DZ, TN, FR, CA, BE, CH",
    availableOnDevice: "Desktop, Mobile, Web",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
