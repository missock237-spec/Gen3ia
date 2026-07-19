'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface AdEvent {
  adId: string;
  type: 'view' | 'click' | 'dismiss';
  timestamp: string;
  plan: string;
}

interface AdContextType {
  /** Compteur de messages pour déclencher les pubs */
  messageCount: number;
  incMessageCount: () => void;
  resetMessageCount: () => void;
  
  /** Récompenses gagnées */
  totalRewards: number;
  
  /** Enregistrer un événement pub */
  trackAdEvent: (adId: string, type: 'view' | 'click' | 'dismiss') => void;
  
  /** Voir si une pub doit s'afficher après ce message */
  shouldShowAd: () => boolean;
  
  /** Dernière pub affichée */
  lastAdIndex: number;
  setLastAdIndex: (idx: number) => void;
}

const AdContext = createContext<AdContextType | null>(null);

export function AdProvider({ children, userPlan = 'free' }: { children: ReactNode; userPlan?: string }) {
  const [messageCount, setMessageCount] = useState(0);
  const [totalRewards, setTotalRewards] = useState(0);
  const [lastAdIndex, setLastAdIndex] = useState(-1);
  const [adHistory, setAdHistory] = useState<AdEvent[]>([]);

  const isPaid = userPlan !== 'free';

  const incMessageCount = useCallback(() => {
    setMessageCount(prev => prev + 1);
  }, []);

  const resetMessageCount = useCallback(() => {
    setMessageCount(0);
  }, []);

  const shouldShowAd = useCallback(() => {
    if (messageCount === 0) return false;
    // Affiche une pub tous les 3 messages pour les free, tous les 5 pour les payants
    return isPaid 
      ? messageCount % 5 === 0 && messageCount > 0
      : messageCount % 3 === 0;
  }, [messageCount, isPaid]);

  const trackAdEvent = useCallback((adId: string, type: 'view' | 'click' | 'dismiss') => {
    const event: AdEvent = {
      adId,
      type,
      timestamp: new Date().toISOString(),
      plan: userPlan,
    };
    setAdHistory(prev => [...prev, event]);

    // Récompense pour les utilisateurs payants
    if (isPaid && (type === 'view' || type === 'click')) {
      setTotalRewards(prev => prev + 1);
    }

    // Envoi à l'API pour analytics
    if (typeof window !== 'undefined') {
      fetch('/api/analytics/ad-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }).catch(() => {});
    }
  }, [userPlan, isPaid]);

  return (
    <AdContext.Provider value={{
      messageCount,
      incMessageCount,
      resetMessageCount,
      totalRewards,
      trackAdEvent,
      shouldShowAd,
      lastAdIndex,
      setLastAdIndex,
    }}>
      {children}
    </AdContext.Provider>
  );
}

export function useAdContext() {
  const ctx = useContext(AdContext);
  if (!ctx) throw new Error('useAdContext must be used within AdProvider');
  return ctx;
}
