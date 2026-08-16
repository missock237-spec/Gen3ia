'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import {
  awardAdReward,
  getCreditBalance,
  getRewardStats,
  syncRewardsWithServer,
  getCreditBalance as getBalance,
} from '@/lib/ad-rewards';

interface CreditBalance {
  total: number;
  today: number;
  thisWeek: number;
  lastUpdated: string;
}

interface AdContextType {
  /** Compteur de messages */
  messageCount: number;
  incMessageCount: () => void;
  /** Solde de crédits réels */
  creditBalance: CreditBalance;
  /** Récompenser une vue/click de pub */
  trackAdEvent: (adId: string, type: 'view' | 'click' | 'dismiss', userPlan: string) => void;
  /** Dernier message de récompense */
  lastRewardMessage: string | null;
  /** Stats des limites */
  rewardStats: ReturnType<typeof getRewardStats>;
}

const AdContext = createContext<AdContextType | null>(null);

export function AdProvider({ children }: { children: ReactNode }) {
  const [messageCount, setMessageCount] = useState(0);
  const [creditBalance, setCreditBalance] = useState<CreditBalance>({ total: 0, today: 0, thisWeek: 0, lastUpdated: new Date().toISOString() });
  const [lastRewardMessage, setLastRewardMessage] = useState<string | null>(null);
  const [rewardStats, setRewardStats] = useState(() => getRewardStats());

  // Charger le solde au montage
  useEffect(() => {
    // Defer setState to avoid react-hooks/set-state-in-effect
    const raf = requestAnimationFrame(() => {
      setCreditBalance(getCreditBalance());
      setRewardStats(getRewardStats());
    });

    // Synchroniser avec le serveur toutes les 60s
    const interval = setInterval(() => {
      void syncRewardsWithServer();
    }, 60000);

    return () => { cancelAnimationFrame(raf); clearInterval(interval); };
  }, []);

  const incMessageCount = useCallback(() => {
    setMessageCount(prev => prev + 1);
  }, []);

  const trackAdEvent = useCallback((adId: string, type: 'view' | 'click' | 'dismiss', userPlan: string) => {
    // Logger l'événement
    fetch('/api/analytics/ad-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adId, type, timestamp: new Date().toISOString(), plan: userPlan }),
    }).catch(() => {});

    // Attribuer les récompenses via le système anti-abuse
    if (type === 'view' || type === 'click') {
      const result = awardAdReward(adId, type, userPlan);
      if (result.success) {
        setCreditBalance(prev => ({
          ...prev,
          total: result.balance?.total ?? prev.total + (result.credits || 0),
          today: result.balance?.today ?? prev.today + (result.credits || 0),
          lastUpdated: new Date().toISOString(),
        }));
        setLastRewardMessage(result.message || null);
        setRewardStats(getRewardStats());

        // Effacer le message après 3 secondes
        setTimeout(() => setLastRewardMessage(null), 3000);
      }
    }
  }, []);

  return (
    <AdContext.Provider value={{
      messageCount,
      incMessageCount,
      creditBalance,
      trackAdEvent,
      lastRewardMessage,
      rewardStats,
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
