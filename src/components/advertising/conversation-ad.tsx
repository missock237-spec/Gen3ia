'use client';

import { useState, useEffect, useCallback } from 'react';

interface ConversationAdProps {
  userId: string;
  sessionId: string;
  conversationId?: string;
  messageCount: number;
  /** Intervalle de messages entre chaque pub (ex: tous les 4 messages) */
  adInterval?: number;
  keywords?: string[];
}

interface AdData {
  shouldShow: boolean;
  adType: 'unrewarded' | 'rewarded';
  campaign: {
    id: string;
    name: string;
    textContent: string;
    ctaText: string;
    ctaUrl: string;
    imageUrl?: string;
    advertiserName: string;
    format?: string;
  } | null;
  reason: string;
  isSubtle?: boolean;
  insertAfterMessages?: number;
}

/**
 * Composant non-intrusif de publicite dans la conversation.
 * S'affiche discretement entre les messages pour les utilisateurs plan free.
 * N'interrompt PAS le flux de la conversation ni l'activite de l'agent.
 */
export function ConversationAd({
  userId,
  sessionId,
  conversationId,
  messageCount,
  adInterval = 4,
  keywords,
}: ConversationAdProps) {
  const [ad, setAd] = useState<AdData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [clicked, setClicked] = useState(false);

  // Afficher une pub tous les X messages
  const shouldShowAd = messageCount > 0 && messageCount % adInterval === 0 && !dismissed;

  const fetchAd = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        scope: 'decide',
        sessionId,
        placement: 'conversation_inline',
        keywords: keywords?.join(',') || '',
        ...(conversationId ? { conversationId } : {}),
      });
      const res = await fetch(`/api/ads?${params}`);
      const data = await res.json();
      if (data.success && data.decision) {
        setAd(data.decision);
      }
    } catch {
      // Silently fail - ne jamais bloquer la conversation
    }
  }, [sessionId, conversationId, keywords]);

  useEffect(() => {
    if (shouldShowAd) {
      fetchAd();
    }
  }, [shouldShowAd, fetchAd]);

  const recordImpression = useCallback(async (campaignId: string) => {
    try {
      await fetch('/api/ads?action=impression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, adType: 'unrewarded', sessionId, conversationId }),
      });
    } catch {}
  }, [sessionId, conversationId]);

  const handleClick = useCallback(async (campaignId: string, impressionId?: string) => {
    if (clicked) return;
    setClicked(true);
    try {
      await fetch('/api/ads?action=click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ impressionId }),
      });
    } catch {}
  }, [clicked]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  if (!shouldShowAd || !ad || !ad.shouldShow || !ad.campaign) return null;

  // Enregistrer l'impression au montage
  useEffect(() => {
    if (ad.campaign) {
      recordImpression(ad.campaign.id);
    }
  }, [ad.campaign?.id]);

  const { campaign } = ad;

  return (
    <div className="relative my-3 mx-2">
      {/* Pub non-intrusive - style carte minimaliste */}
      <div
        style={{
          background: 'var(--muted)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          opacity: 0.85,
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.85')}
      >
        {/* Badge "Sponsorisé" */}
        <div
          style={{
            fontSize: '0.6rem',
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            position: 'absolute',
            top: '-8px',
            left: '12px',
            background: 'var(--background)',
            padding: '0 6px',
            borderRadius: '4px',
          }}
        >
          Sponsorise
        </div>

        {/* Contenu de la pub */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: '0.8rem',
              margin: 0,
              color: 'var(--foreground)',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {campaign.textContent || campaign.name}
          </p>
          <p
            style={{
              fontSize: '0.65rem',
              margin: '4px 0 0',
              color: 'var(--muted-foreground)',
            }}
          >
            {campaign.advertiserName}
          </p>
        </div>

        {/* CTA bouton discret */}
        <a
          href={campaign.ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => handleClick(campaign.id)}
          style={{
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            padding: '6px 14px',
            borderRadius: 'var(--radius)',
            fontSize: '0.75rem',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {campaign.ctaText}
        </a>

        {/* Bouton fermer discret */}
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted-foreground)',
            cursor: 'pointer',
            padding: '2px',
            fontSize: '0.8rem',
            lineHeight: 1,
            opacity: 0.5,
            flexShrink: 0,
          }}
          aria-label="Fermer"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/**
 * Hook pour savoir si l'utilisateur doit avoir des pubs dans sa conversation
 */
export function useMustShowAdsInConversation() {
  const [mustShow, setMustShow] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ads?scope=preferences')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setMustShow(data.preferences?.mustShowInConversation || data.preferences?.isEligible || false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { mustShow, loading };
}

/**
 * Exemple d'integration dans le composant de chat :
 *
 * ```tsx
 * import { ConversationAd } from '@/components/advertising/conversation-ad';
 *
 * // Dans le render du chat, entre les messages :
 * {messages.map((msg, i) => (
 *   <React.Fragment key={msg.id}>
 *     <MessageBubble message={msg} />
 *     {plan === 'free' && (
 *       <ConversationAd
 *         userId={session.user.id}
 *         sessionId={session.id}
 *         conversationId={conversation.id}
 *         messageCount={i + 1}
 *         adInterval={4}
 *         keywords={extractKeywords(msg.content)}
 *       />
 *     )}
 *   </React.Fragment>
 * ))}
 * ```
 */
