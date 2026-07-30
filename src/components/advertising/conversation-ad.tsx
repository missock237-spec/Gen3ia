'use client';

import { useState, useEffect, useCallback } from 'react';

interface ConversationAdProps {
  userId: string;
  sessionId: string;
  conversationId?: string;
  messageCount: number;
  adInterval?: number;
  keywords?: string[];
}

interface AdData {
  shouldShow: boolean;
  adType: 'unrewarded' | 'rewarded';
  campaign: {
    id: string; name: string; textContent: string; ctaText: string;
    ctaUrl: string; imageUrl?: string; advertiserName: string; format?: string;
  } | null;
  reason: string;
  isSubtle?: boolean;
  insertAfterMessages?: number;
}

export function ConversationAd({ userId, sessionId, conversationId, messageCount, adInterval = 4, keywords }: ConversationAdProps) {
  const [ad, setAd] = useState<AdData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [impressionRecorded, setImpressionRecorded] = useState(false);

  const shouldShowAd = messageCount > 0 && messageCount % adInterval === 0 && !dismissed;

  const fetchAd = useCallback(async () => {
    try {
      const params = new URLSearchParams({ scope: 'decide', sessionId, placement: 'conversation_inline', keywords: keywords?.join(',') || '', ...(conversationId ? { conversationId } : {}) });
      const res = await fetch(`/api/ads?${params}`);
      const data = await res.json();
      if (data.success && data.decision) setAd(data.decision);
    } catch {}
  }, [sessionId, conversationId, keywords]);

  useEffect(() => { if (shouldShowAd) fetchAd(); }, [shouldShowAd, fetchAd]);

  // Enregistrer l'impression (toujours avant le return, respecte les hooks)
  useEffect(() => {
    if (ad?.campaign && !impressionRecorded) {
      setImpressionRecorded(true);
      fetch('/api/ads?action=impression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: ad.campaign.id, adType: 'unrewarded', sessionId, conversationId }),
      }).catch(() => {});
    }
  }, [ad?.campaign?.id, impressionRecorded, sessionId, conversationId]);

  const handleClick = useCallback(async () => {
    if (clicked) return;
    setClicked(true);
    try { await fetch('/api/ads?action=click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); } catch {}
  }, [clicked]);

  const handleDismiss = useCallback(() => { setDismissed(true); }, []);

  if (!shouldShowAd || !ad || !ad.shouldShow || !ad.campaign) return null;

  const { campaign } = ad;

  return (
    <div style={{ position: 'relative', margin: '12px 8px' }}>
      <div style={{
        background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', opacity: 0.85,
      }}>
        <div style={{
          fontSize: '0.6rem', color: 'var(--muted-foreground)', textTransform: 'uppercase',
          position: 'absolute', top: '-8px', left: '12px', background: 'var(--background)',
          padding: '0 6px', borderRadius: '4px', letterSpacing: '0.5px',
        }}>Sponsorise</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.8rem', margin: 0, color: 'var(--foreground)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {campaign.textContent || campaign.name}
          </p>
          <p style={{ fontSize: '0.65rem', margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{campaign.advertiserName}</p>
        </div>
        <a href={campaign.ctaUrl} target="_blank" rel="noopener noreferrer" onClick={handleClick}
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', padding: '6px 14px', borderRadius: 'var(--radius)', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {campaign.ctaText}
        </a>
        <button onClick={handleDismiss}
          style={{ background: 'none', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', padding: '2px', fontSize: '0.8rem', lineHeight: 1, opacity: 0.5, flexShrink: 0 }}
          aria-label="Fermer">×</button>
      </div>
    </div>
  );
}

export function useMustShowAdsInConversation() {
  const [mustShow, setMustShow] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/ads?scope=preferences').then(r => r.json()).then(data => {
      if (data.success) setMustShow(data.preferences?.mustShowInConversation || data.preferences?.isEligible || false);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  return { mustShow, loading };
}
