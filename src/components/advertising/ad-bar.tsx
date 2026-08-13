'use client';

// ============================================================
// AdBar — Bottom-bar ad + entrypoint to ad preferences.
// ------------------------------------------------------------
// Renders a single sponsored link. Used on dashboard routes that
// are NOT the chat conversation (the chat conversation uses
// <ConversationAd/> after every AI response).
// ============================================================

import { useState, useEffect, useCallback } from 'react';

interface AdCampaign {
  id: string;
  name: string;
  advertiserName: string;
  advertiserUrl: string;
  textContent: string;
  ctaText: string;
  ctaUrl: string;
}

interface AdDecision {
  shouldShow: boolean;
  adType: 'unrewarded' | 'rewarded';
  campaign: AdCampaign | null;
  reason: string;
  pendingRewardPerView: number;
  pendingRewardPerClick: number;
  isFreePlan: boolean;
  canDisableAds: boolean;
}

interface AdPreferences {
  adsEnabled: boolean;
  rewardedAdsEnabled: boolean;
  totalCreditsEarned: number;
  totalAdsViewed: number;
  isEligible: boolean;
  adType: 'unrewarded' | 'rewarded';
  mustShowInConversation: boolean;
  canDisableAds: boolean;
  isFreePlan: boolean;
}

interface AdBarProps {
  sessionId: string;
  conversationId?: string;
  placement?: string;
  onAdClicked?: (rewarded: boolean, amount: number) => void;
}

export function AdBar({ sessionId, conversationId, placement = 'bottom_bar', onAdClicked }: AdBarProps) {
  const [decision, setDecision] = useState<AdDecision | null>(null);
  const [preferences, setPreferences] = useState<AdPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [impressionId, setImpressionId] = useState<string | null>(null);
  const [pendingReward, setPendingReward] = useState(0);

  useEffect(() => {
    loadPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAd = useCallback(
    async (adType: 'unrewarded' | 'rewarded') => {
      try {
        const params = new URLSearchParams({
          scope: 'decide',
          sessionId,
          placement,
        });
        if (conversationId) params.set('conversationId', conversationId);
        const res = await fetch(`/api/ads?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        const dec: AdDecision | null = data?.decision ?? null;
        setDecision(dec);
        if (dec?.shouldShow && dec.campaign) {
          try {
            const impRes = await fetch('/api/ads?action=impression', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                campaignId: dec.campaign.id,
                adType,
                sessionId,
                conversationId,
              }),
            });
            if (impRes.ok) {
              const impData = await impRes.json();
              const imp = impData?.impression;
              if (imp?.impressionId) setImpressionId(imp.impressionId);
              if (imp?.rewardCredited && Number(imp?.rewardAmount ?? 0) > 0) {
                setPendingReward(Number(imp.rewardAmount));
              }
            }
          } catch {
            // Non-fatal.
          }
        }
        setLoading(false);
      } catch {
        setLoading(false);
      }
    },
    [sessionId, conversationId, placement]
  );

  const loadPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/ads?scope=preferences', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const prefs: AdPreferences = data?.preferences;
        setPreferences(prefs);
        if (prefs?.adsEnabled) {
          await fetchAd(prefs.adType);
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, [fetchAd]);

  const handleClick = useCallback(async () => {
    if (!impressionId) return;
    try {
      const res = await fetch('/api/ads?action=click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ impressionId }),
      });
      if (res.ok) {
        const data = await res.json();
        const click = data?.click;
        if (click?.rewardCredited && Number(click?.rewardAmount ?? 0) > 0) {
          setPendingReward(prev => prev + Number(click.rewardAmount));
          onAdClicked?.(true, Number(click.rewardAmount));
        }
      }
    } catch {
      // Non-fatal.
    }
  }, [impressionId, onAdClicked]);

  if (loading || !decision || !decision.shouldShow || !decision.campaign) {
    return null;
  }

  const { campaign, isFreePlan, canDisableAds, pendingRewardPerClick } = decision;
  const ctaUrl = campaign.ctaUrl || campaign.advertiserUrl;
  const safeUrl =
    ctaUrl.startsWith('http://') || ctaUrl.startsWith('https://') ? ctaUrl : `https://${ctaUrl}`;

  return (
    <div
      role="complementary"
      aria-label="Sponsored link"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        padding: '8px 16px',
        background: 'var(--card, #fff)',
        borderTop: '1px solid var(--border, #e5e7eb)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '0.8rem',
      }}
    >
      <span
        style={{
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--muted-foreground, #6b7280)',
          flexShrink: 0,
        }}
      >
        Sponsorisé
      </span>
      <span style={{ flex: 1, minWidth: 0, color: 'var(--foreground, #111827)' }}>
        {campaign.textContent || campaign.name}{' '}
        <span style={{ color: 'var(--muted-foreground, #6b7280)' }}>— {campaign.advertiserName}</span>
      </span>
      <a
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={handleClick}
        style={{
          color: 'var(--primary, #2563eb)',
          fontWeight: 600,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {campaign.ctaText || 'En savoir plus'} →
      </a>
      {!isFreePlan && pendingReward > 0 && (
        <span
          style={{
            fontSize: '0.65rem',
            color: 'var(--success, #16a34a)',
            background: 'var(--success-soft, #dcfce7)',
            padding: '2px 6px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
          }}
          title={`+${pendingRewardPerClick} crédits si vous cliquez`}
        >
          +{pendingReward} crédit{pendingReward > 1 ? 's' : ''}
        </span>
      )}
      {canDisableAds && (
        <a
          href="/dashboard/settings?tab=ads"
          style={{
            fontSize: '0.65rem',
            color: 'var(--muted-foreground, #6b7280)',
            textDecoration: 'none',
            flexShrink: 0,
          }}
          title="Désactiver les publicités"
        >
          ⋯
        </a>
      )}
    </div>
  );
}
