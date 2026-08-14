'use client';

// ============================================================
// ConversationAd — Sponsored link rendered after every AI agent response.
// ------------------------------------------------------------
// Behavior:
//   * Display format = LINK ONLY (no image, no video, no carousel).
//   * Free plan users: ad is always shown (cannot be dismissed
//     permanently). No credit reward.
//   * Paid plan users: ad is shown with a small credit reward banner.
//     The user may toggle ads off from the settings page; when off,
//     the ad does NOT render at all (rewards are also blocked).
//   * When `decision.canDisableAds === false` (free plan), the close
//     button is hidden.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ConversationAdCampaign {
  id: string;
  name: string;
  advertiserName: string;
  advertiserUrl: string;
  textContent: string;
  ctaText: string;
  ctaUrl: string;
}

export interface ConversationAdDecision {
  shouldShow: boolean;
  adType: 'unrewarded' | 'rewarded';
  campaign: ConversationAdCampaign | null;
  reason: string;
  placement?: string;
  variantText?: string;
  pendingRewardPerView: number;
  pendingRewardPerClick: number;
  isFreePlan: boolean;
  canDisableAds: boolean;
}

interface ConversationAdProps {
  userId: string;
  sessionId: string;
  conversationId?: string;
  /** Optional keywords used for ad targeting. */
  keywords?: string[];
  /** Notify parent when an impression was credited (for UI feedback). */
  onRewardEarned?: (credits: number) => void;
}

export function ConversationAd({
  userId,
  sessionId,
  conversationId,
  keywords,
  onRewardEarned,
}: ConversationAdProps) {
  const [decision, setDecision] = useState<ConversationAdDecision | null>(null);
  const [impressionId, setImpressionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingReward, setPendingReward] = useState<number>(0);
  const fetchedRef = useRef<string | null>(null);

  const fetchAd = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        scope: 'decide',
        sessionId,
        placement: 'conversation_inline',
      });
      if (conversationId) params.set('conversationId', conversationId);
      if (keywords && keywords.length > 0) params.set('keywords', keywords.join(','));

      const res = await fetch(`/api/ads?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        setError('Ad fetch failed');
        return;
      }
      const data = await res.json();
      const dec: ConversationAdDecision | null = data?.decision ?? null;
      setDecision(dec);
      if (dec?.shouldShow && dec.campaign) {
        // Record the impression immediately so the user is credited (if eligible).
        try {
          const impRes = await fetch('/api/ads?action=impression', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              campaignId: dec.campaign.id,
              adType: dec.adType,
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
              onRewardEarned?.(Number(imp.rewardAmount));
            }
          }
        } catch {
          // Impression failure is non-fatal — we still render the ad link.
        }
      }
    } catch {
      setError('Ad fetch failed');
    }
  }, [sessionId, conversationId, keywords, onRewardEarned]);

  useEffect(() => {
    // Fetch once per mount — every AI response gets a fresh mount.
    const key = `${sessionId}:${conversationId || ''}:${Date.now()}`;
    if (fetchedRef.current === key) return;
    fetchedRef.current = key;
    fetchAd();
  }, [fetchAd, sessionId, conversationId]);

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
          onRewardEarned?.(Number(click.rewardAmount));
        }
      }
    } catch {
      // Click reward failure is non-fatal.
    }
  }, [impressionId, onRewardEarned]);

  if (error || !decision || !decision.shouldShow || !decision.campaign) {
    return null;
  }

  const { campaign, isFreePlan, canDisableAds, pendingRewardPerClick } = decision;
  const ctaUrl = campaign.ctaUrl || campaign.advertiserUrl;
  const safeUrl = ctaUrl.startsWith('http://') || ctaUrl.startsWith('https://') ? ctaUrl : `https://${ctaUrl}`;

  return (
    <div
      role="complementary"
      aria-label="Sponsored link"
      style={{
        margin: '10px 0',
        padding: '8px 12px',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: '8px',
        background: 'var(--muted, #f9fafb)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '0.8rem',
        lineHeight: 1.4,
      }}
    >
      <span
        style={{
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--muted-foreground, #6b7280)',
          background: 'var(--background, #fff)',
          padding: '2px 6px',
          borderRadius: '4px',
          border: '1px solid var(--border, #e5e7eb)',
          flexShrink: 0,
        }}
      >
        Sponsorisé
      </span>
      <span style={{ flex: 1, minWidth: 0, color: 'var(--foreground, #111827)' }}>
        {decision?.variantText || campaign.textContent || campaign.name}{' '}
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
        {decision?.variantCta || campaign.ctaText || 'En savoir plus'} →
      </a>
      {!isFreePlan && pendingReward > 0 && (
        <span
          aria-live="polite"
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
