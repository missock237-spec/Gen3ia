'use client';

import { useEffect, useRef, useState } from 'react';

interface RealAdDisplayProps {
  /** Format de la pub */
  format?: 'auto' | 'display' | 'in-feed' | 'in-article' | 'matched-content';
  /** Style : banner horizontal ou sidebar rectangulaire */
  variant?: 'banner' | 'sidebar' | 'native';
  /** Slot personnalisé AdSense */
  adSlot?: string;
  /** Classes CSS supplémentaires */
  className?: string;
}

/**
 * Composant d'affichage de vraies publicités.
 * 
 * - Si ADSENSE_CLIENT_ID est configuré → affiche les vraies pubs Google AdSense
 * - Sinon → affiche une pub in-house Genova (fallback)
 */
export function RealAdDisplay({ format = 'auto', variant = 'banner', adSlot, className = '' }: RealAdDisplayProps) {
  const adRef = useRef<HTMLDivElement>(null);
  const [adLoaded, setAdLoaded] = useState(false);
  const [useRealAds, setUseRealAds] = useState(false);

  useEffect(() => {
    // Vérifier si AdSense est configuré
    const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID || '';
    if (adsenseId) {
      setUseRealAds(true);
      
      try {
        const script = document.createElement('script');
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseId}`;
        script.async = true;
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);

        // Pousser l'annonce
        setTimeout(() => {
          try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
            setAdLoaded(true);
          } catch (e) {
            console.warn('AdSense error:', e);
            setUseRealAds(false);
          }
        }, 500);
      } catch (e) {
        console.warn('AdSense load error:', e);
        setUseRealAds(false);
      }
    }
  }, []);

  // === VRAIES PUBS GOOGLE ADSENSE ===
  if (useRealAds) {
    const width = variant === 'sidebar' ? 300 : 728;
    const height = variant === 'sidebar' ? 250 : 90;

    return (
      <div className={`overflow-hidden ${className}`}>
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}
          data-ad-slot={adSlot || process.env.NEXT_PUBLIC_ADSENSE_AD_SLOT || '1234567890'}
          data-ad-format={format}
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  // === FALLBACK : PUB IN-HOUSE GENOVA ===
  const getFallbackAd = () => {
    const ads = [
      {
        title: 'Passez à Genova Pro',
        desc: 'Crédits illimités, 20 agents, 10 clés API',
        cta: 'Voir les offres',
        color: 'from-primary/20 to-primary/5',
        icon: '⭐',
      },
      {
        title: 'Gagnez des crédits gratuits',
        desc: 'Regardez des pubs pour obtenir des crédits',
        cta: 'Gagner maintenant',
        color: 'from-amber-500/20 to-amber-500/5',
        icon: '🎯',
      },
      {
        title: 'Vendez vos agents AI',
        desc: 'Publiez sur le Marketplace et gagnez 70%',
        cta: 'Commencer à vendre',
        color: 'from-emerald-500/20 to-emerald-500/5',
        icon: '💰',
      },
      {
        title: 'Terminal de code intégré',
        desc: 'Exécutez JS, Python, Bash directement',
        cta: 'Essayer',
        color: 'from-purple-500/20 to-purple-500/5',
        icon: '💻',
      },
    ];
    return ads[Math.floor(Math.random() * ads.length)];
  };

  const fallback = getFallbackAd();

  if (variant === 'sidebar') {
    return (
      <div className={`rounded-xl border bg-gradient-to-br ${fallback.color} p-4 ${className}`}>
        <div className="flex items-start gap-3">
          <span className="text-2xl">{fallback.icon}</span>
          <div className="min-w-0">
            <p className="font-semibold text-sm">{fallback.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{fallback.desc}</p>
            <button className="text-xs font-medium text-primary hover:underline mt-2">
              {fallback.cta} →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between gap-4 rounded-xl border bg-gradient-to-r ${fallback.color} px-4 py-3 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xl shrink-0">{fallback.icon}</span>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{fallback.title}</p>
          <p className="text-xs text-muted-foreground truncate">{fallback.desc}</p>
        </div>
      </div>
      <button className="shrink-0 text-xs font-medium text-primary hover:underline whitespace-nowrap">
        {fallback.cta}
      </button>
    </div>
  );
}

// Déclaration TypeScript pour Adsense
// Ajoute ceci dans un fichier .d.ts si nécessaire
declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}
