'use client';

import { useState, useEffect, useCallback } from 'react';

interface AdCampaign {
  id: string; name: string; advertiserName: string; advertiserUrl: string;
  imageUrl: string; videoUrl?: string; textContent: string; ctaText: string; ctaUrl: string;
  format?: string; placement?: string;
}

interface AdDecision {
  shouldShow: boolean; adType: 'unrewarded' | 'rewarded';
  campaign: AdCampaign | null; reason: string;
  placement?: string; format?: string;
}

interface AdPreferences {
  adsEnabled: boolean; rewardedAdsEnabled: boolean;
  totalCreditsEarned: number; totalAdsViewed: number;
  isEligible: boolean; adType: 'unrewarded' | 'rewarded';
}

interface AdBarProps {
  sessionId: string; conversationId?: string;
  placement?: string;
  onAdClicked?: (rewarded: boolean, amount: number) => void;
}

const DISMISSED_KEY = 'genova_dismissed_ads';

export function AdBar({ sessionId, conversationId, placement = 'bottom_bar', onAdClicked }: AdBarProps) {
  const [decision, setDecision] = useState<AdDecision | null>(null);
  const [preferences, setPreferences] = useState<AdPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [impressionId, setImpressionId] = useState<string | null>(null);
  const [rewarded, setRewarded] = useState(false);
  const [rewardAmount, setRewardAmount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);

  useEffect(() => { loadPreferences(); }, []);

  const isDismissed = (id: string) => {
    try {
      const stored = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
      return stored.includes(id);
    } catch { return false; }
  };

  const markDismissed = (id: string) => {
    try {
      const stored = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
      stored.push(id);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(stored.slice(-20)));
    } catch {}
  };

  const loadPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/advertising?action=preferences');
      if (res.ok) {
        const data = await res.json();
        setPreferences(data);
        if (data.isEligible) fetchAd(data.adType);
        else setLoading(false);
      }
    } catch { setLoading(false); }
  }, []);

  const fetchAd = useCallback(async (adType: string) => {
    try {
      const params = new URLSearchParams({ action: 'decide', sessionId, placement });
      if (conversationId) params.set('conversationId', conversationId);
      const res = await fetch('/api/advertising?' + params.toString());
      if (res.ok) {
        const data = await res.json();
        setDecision(data);
        if (data.shouldShow && data.campaign) {
          if (isDismissed(data.campaign.id)) {
            setDismissed(true);
            setTimeout(() => fetchAd(adType), 45000);
            return;
          }
          setDismissed(false);
          recordImpression(data.campaign.id, data.adType);
        }
      }
    } catch {}
    setLoading(false);
  }, [sessionId, conversationId, placement]);

  const recordImpression = useCallback(async (campaignId: string, adType: string) => {
    try {
      const res = await fetch('/api/advertising', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'impression', campaignId, adType, sessionId, conversationId }),
      });
      if (res.ok) {
        const data = await res.json();
        setImpressionId(data.impressionId);
        if (data.rewardCredited) { setRewarded(true); setRewardAmount(data.rewardAmount); }
      }
    } catch {}
  }, [sessionId, conversationId]);

  const handleClick = useCallback(async () => {
    if (!impressionId || !decision?.campaign) return;
    try {
      const res = await fetch('/api/advertising', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'click', impressionId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rewardCredited && data.rewardAmount > 0) onAdClicked?.(true, data.rewardAmount);
        window.open(decision.campaign.ctaUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {}
  }, [impressionId, decision, onAdClicked]);

  const dismissAd = useCallback(() => {
    setDismissed(true);
    if (decision?.campaign) markDismissed(decision.campaign.id);
    setTimeout(() => { if (decision) fetchAd(decision.adType); }, 60000);
  }, [decision, fetchAd]);

  if (loading || dismissed || !decision?.shouldShow || !decision?.campaign) return null;

  const campaign = decision.campaign;
  const isRewarded = decision.adType === 'rewarded';
  const adFormat = campaign.format || 'banner';
  const isVideo = adFormat === 'video' && campaign.videoUrl;

  if (placement === 'sidebar' || placement === 'banner_top') {
    return (
      <div style={{
        width: '100%', padding: '8px 12px', margin: '8px 0',
        borderRadius: '8px', background: 'linear-gradient(135deg, rgba(124,58,237,0.05), rgba(59,130,246,0.05))',
        border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
      }} onClick={handleClick}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <span style={{
            fontSize: 9, padding: '1px 5px', borderRadius: 3,
            background: isRewarded ? 'rgba(251,191,36,0.2)' : 'rgba(107,114,128,0.2)',
            color: isRewarded ? '#fbbf24' : '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap',
          }}>{isRewarded ? 'Sponsorise' : 'Pub'}</span>
          {campaign.imageUrl && <img src={campaign.imageUrl} alt='' style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} />}
          <span style={{ color: '#9ca3af', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign.textContent}</span>
          <span style={{
            padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 500,
            background: isRewarded ? 'rgba(251,191,36,0.15)' : 'rgba(124,58,237,0.15)',
            color: isRewarded ? '#fbbf24' : '#a78bfa',
          }}>{campaign.ctaText}</span>
          {rewarded && rewardAmount > 0 && <span style={{ color: '#34d399', fontSize: 10 }}>+{rewardAmount}</span>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(135deg, rgba(124,58,237,0.03), rgba(59,130,246,0.03))' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', gap: 8, maxWidth: 1200, margin: '0 auto' }}>
        <span style={{
          fontSize: 9, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap', fontWeight: 600,
          background: isRewarded ? 'rgba(251,191,36,0.2)' : 'rgba(107,114,128,0.2)',
          color: isRewarded ? '#fbbf24' : '#9ca3af',
        }}>{isRewarded ? 'Sponsorise' : 'Publicite'}</span>

        <div onClick={handleClick} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 0 }}>
          {isVideo ? (
            <video src={campaign.videoUrl} style={{ width: 40, height: 28, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
              muted autoPlay loop playsInline onMouseEnter={() => setVideoPlaying(true)} onMouseLeave={() => setVideoPlaying(false)} />
          ) : campaign.imageUrl ? (
            <img src={campaign.imageUrl} alt='' style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : null}
          <span style={{ fontSize: 12, color: '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {campaign.textContent}
          </span>
          <span style={{
            flexShrink: 0, fontSize: 10, padding: '3px 10px', borderRadius: 4, fontWeight: 500,
            background: isRewarded ? 'rgba(251,191,36,0.15)' : 'rgba(124,58,237,0.15)',
            color: isRewarded ? '#fbbf24' : '#a78bfa',
          }}>{campaign.ctaText}</span>
        </div>

        {rewarded && rewardAmount > 0 && <span style={{ fontSize: 10, color: '#34d399', whiteSpace: 'nowrap' }}>+{rewardAmount} credits</span>}

        <button onClick={dismissAd} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>x</button>
      </div>
    </div>
  );
}
