'use client';

import { useState, useEffect, useCallback } from 'react';

interface AdCampaign {
  id: string;
  name: string;
  advertiserName: string;
  advertiserUrl: string;
  imageUrl: string;
  textContent: string;
  ctaText: string;
  ctaUrl: string;
}

interface AdDecision {
  shouldShow: boolean;
  adType: 'unrewarded' | 'rewarded';
  campaign: AdCampaign | null;
  reason: string;
}

interface AdPreferences {
  adsEnabled: boolean;
  rewardedAdsEnabled: boolean;
  totalCreditsEarned: number;
  totalAdsViewed: number;
  isEligible: boolean;
  adType: 'unrewarded' | 'rewarded';
}

interface AdBarProps {
  sessionId: string;
  conversationId?: string;
  onAdClicked?: (rewarded: boolean, amount: number) => void;
}

export function AdBar({ sessionId, conversationId, onAdClicked }: AdBarProps) {
  const [decision, setDecision] = useState<AdDecision | null>(null);
  const [preferences, setPreferences] = useState<AdPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [impressionId, setImpressionId] = useState<string | null>(null);
  const [rewarded, setRewarded] = useState(false);
  const [rewardAmount, setRewardAmount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Charger les préférences au montage
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/advertising?action=preferences');
      if (res.ok) {
        const data = await res.json();
        setPreferences(data);
        if (data.isEligible) {
          fetchAd(data.adType);
        } else {
          setLoading(false);
        }
      }
    } catch {}
  }, []);

  const fetchAd = useCallback(async (adType: string) => {
    try {
      const url = `/api/advertising?action=decide&sessionId=${sessionId}${conversationId ? `&conversationId=${conversationId}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setDecision(data);
        if (data.shouldShow && data.campaign) {
          setDismissed(false);
          // Enregistrer l'impression
          recordImpression(data.campaign.id, data.adType);
        }
      }
    } catch {}
    setLoading(false);
  }, [sessionId, conversationId]);

  const recordImpression = useCallback(async (campaignId: string, adType: string) => {
    try {
      const res = await fetch('/api/advertising', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'impression',
          campaignId,
          adType,
          sessionId,
          conversationId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setImpressionId(data.impressionId);
        if (data.rewardCredited) {
          setRewarded(true);
          setRewardAmount(data.rewardAmount);
        }
      }
    } catch {}
  }, [sessionId, conversationId]);

  const handleClick = useCallback(async () => {
    if (!impressionId || !decision?.campaign) return;

    try {
      const res = await fetch('/api/advertising', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'click',
          impressionId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.rewardCredited && data.rewardAmount > 0) {
          onAdClicked?.(true, data.rewardAmount);
        }
        // Ouvrir dans un nouvel onglet
        window.open(decision.campaign!.ctaUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {}
  }, [impressionId, decision, onAdClicked]);

  const toggleRewardedAds = useCallback(async () => {
    if (!preferences) return;
    const newValue = !preferences.rewardedAdsEnabled;

    try {
      const res = await fetch('/api/advertising', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preferences',
          rewardedAdsEnabled: newValue,
        }),
      });

      if (res.ok) {
        setPreferences(prev => prev ? { ...prev, rewardedAdsEnabled: newValue } : null);
        if (newValue) {
          fetchAd('rewarded');
        }
      }
    } catch {}
  }, [preferences, fetchAd]);

  const dismissAd = useCallback(() => {
    setDismissed(true);
    setTimeout(() => {
      fetchAd(decision?.adType || 'unrewarded');
    }, 30000);
  }, [decision, fetchAd]);

  if (loading || dismissed || !decision?.shouldShow || !decision?.campaign) {
    return null;
  }

  const campaign = decision.campaign;
  const isRewarded = decision.adType === 'rewarded';

  return (
    <div className="ad-bar-container">
      {/* Style injecté */}
      <style>{`
        .ad-bar-container {
          width: 100%;
          border-top: 1px solid rgba(255,255,255,0.1);
          background: linear-gradient(135deg, rgba(124,58,237,0.05) 0%, rgba(59,130,246,0.05) 100%);
        }
        .ad-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          max-width: 1200px;
          margin: 0 auto;
          gap: 12px;
        }
        .ad-badge {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 4px;
          white-space: nowrap;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .ad-badge-unrewarded {
          background: rgba(107,114,128,0.2);
          color: #9ca3af;
        }
        .ad-badge-rewarded {
          background: rgba(251,191,36,0.2);
          color: #fbbf24;
        }
        .ad-content {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          min-width: 0;
        }
        .ad-image {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .ad-text {
          font-size: 12px;
          color: #d1d5db;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          line-height: 1.3;
        }
        .ad-cta {
          flex-shrink: 0;
          font-size: 11px;
          padding: 4px 12px;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.15s;
        }
        .ad-cta-unrewarded {
          background: rgba(124,58,237,0.15);
          color: #a78bfa;
        }
        .ad-cta-unrewarded:hover {
          background: rgba(124,58,237,0.25);
        }
        .ad-cta-rewarded {
          background: rgba(251,191,36,0.15);
          color: #fbbf24;
        }
        .ad-cta-rewarded:hover {
          background: rgba(251,191,36,0.25);
        }
        .ad-reward-notification {
          font-size: 10px;
          color: #34d399;
          font-weight: 500;
        }
        .ad-settings-toggle {
          background: none;
          border: none;
          color: #6b7280;
          cursor: pointer;
          font-size: 14px;
          padding: 2px;
        }
        .ad-settings-panel {
          position: absolute;
          bottom: 100%;
          right: 0;
          background: #1f2937;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 11px;
          white-space: nowrap;
          z-index: 50;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .ad-settings-toggle-wrapper {
          position: relative;
        }
        .ad-settings-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        .ad-settings-label input {
          accent-color: #7c3aed;
        }
        .ad-dismiss {
          background: none;
          border: none;
          color: #4b5563;
          cursor: pointer;
          font-size: 14px;
          padding: 2px 4px;
        }
        .ad-dismiss:hover {
          color: #9ca3af;
        }
      `}</style>

      <div className="ad-bar">
        {/* Badge */}
        <span className={`ad-badge ${isRewarded ? 'ad-badge-rewarded' : 'ad-badge-unrewarded'}`}>
          {isRewarded ? '★ Pub Récompensée' : 'Publicité'}
        </span>

        {/* Contenu de la pub */}
        <div className="ad-content" onClick={handleClick} title={campaign.textContent}>
          {campaign.imageUrl && (
            <img
              src={campaign.imageUrl}
              alt=""
              className="ad-image"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <span className="ad-text">{campaign.textContent}</span>
          <span className={`ad-cta ${isRewarded ? 'ad-cta-rewarded' : 'ad-cta-unrewarded'}`}>
            {campaign.ctaText}
          </span>
        </div>

        {/* Notification de récompense */}
        {rewarded && rewardAmount > 0 && (
          <span className="ad-reward-notification">+{rewardAmount} crédits</span>
        )}

        {/* Paramètres (uniquement pour utilisateurs payants) */}
        {preferences && !preferences.isEligible && (
          <div className="ad-settings-toggle-wrapper">
            <button
              className="ad-settings-toggle"
              onClick={() => setShowSettings(!showSettings)}
              title="Paramètres des publicités"
            >
              ⚙
            </button>
            {showSettings && (
              <div className="ad-settings-panel">
                <label className="ad-settings-label">
                  <input
                    type="checkbox"
                    checked={preferences.rewardedAdsEnabled}
                    onChange={toggleRewardedAds}
                  />
                  <span>Pubs récompensées</span>
                  {preferences.rewardedAdsEnabled && (
                    <span style={{ color: '#34d399' }}>
                      (+{preferences.totalCreditsEarned} crédits gagnés)
                    </span>
                  )}
                </label>
              </div>
            )}
          </div>
        )}

        {/* Bouton fermer */}
        <button className="ad-dismiss" onClick={dismissAd} title="Fermer">
          ✕
        </button>
      </div>
    </div>
  );
}
