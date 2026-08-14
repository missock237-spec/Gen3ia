'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, ExternalLink, VolumeX, Award, Clock } from 'lucide-react';
import { awardAdReward } from '@/lib/ad-rewards';

// Inline CSS pour les animations
const styles = `
  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes pulseGreen {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }

  @keyframes fadeOut {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }

  .ad-bar-enter {
    animation: slideInUp 0.4s ease-out;
  }

  .ad-reward-popup {
    animation: pulseGreen 0.6s ease-in-out;
  }

  .ad-bar-dismiss {
    animation: fadeOut 0.3s ease-out forwards;
  }
`;


interface AdCampaign {
  id: string;
  name: string;
  imageUrl: string;
  textContent: string;
  ctaText: string;
  ctaUrl: string;
  advertiserName: string;
  rewardPerClick: number;
  rewardPerView: number;
}

interface PostPromptAdBarProps {
  campaign: AdCampaign;
  userId: string;
  userPlan: 'free' | 'starter' | 'pro' | 'enterprise';
  sessionId: string;
  impressionId: string;
  onDismiss?: () => void;
  /** Mode subtle pour les pubs dans la conversation */
  isSubtle?: boolean;
}

/**
 * Barre publicitaire post-prompt
 * 
 * Pour FREE users: non-supprimable, sans récompense
 * Pour PREMIUM users: supprimable, avec récompense au clic
 */
export function PostPromptAdBar({
  campaign,
  userId,
  userPlan,
  sessionId,
  impressionId,
  onDismiss,
  isSubtle = false,
}: PostPromptAdBarProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [showCreditReward, setShowCreditReward] = useState(false);
  const [rewardAmount, setRewardAmount] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const isFreeUser = userPlan === 'free';
  const canDismiss = !isFreeUser; // Seulement les users premium+ peuvent fermer

  // Enregistrer l'impression au montage
  useEffect(() => {
    const recordView = async () => {
      try {
        await fetch('/api/advertising/record-impression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            impressionId,
            campaignId: campaign.id,
            userId,
            sessionId,
            adType: isFreeUser ? 'unrewarded' : 'rewarded',
          }),
        });
      } catch (error) {
        console.error('[PostPromptAdBar] Failed to record view:', error);
      }
    };

    recordView();
  }, [impressionId, campaign.id, userId, sessionId, isFreeUser]);

  // Gérer le clic sur le CTA
  const handleCtaClick = useCallback(async () => {
    try {
      // Enregistrer le clic
      await fetch('/api/advertising/record-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          impressionId,
          userId,
          adType: isFreeUser ? 'unrewarded' : 'rewarded',
        }),
      });

      // Récompenser si utilisateur premium
      if (!isFreeUser && campaign.rewardPerClick > 0) {
        const result = awardAdReward(campaign.id, 'click', userPlan);
        if (result.success) {
          setRewardAmount(result.credits || 0);
          setShowCreditReward(true);
          setTimeout(() => setShowCreditReward(false), 3000);
        }
      }

      // Ouvrir l'URL
      if (campaign.ctaUrl) {
        window.open(campaign.ctaUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('[PostPromptAdBar] Failed to handle click:', error);
    }
  }, [impressionId, userId, isFreeUser, campaign.id, campaign.ctaUrl, campaign.rewardPerClick, userPlan]);

  // Gérer la fermeture (seulement pour premium+)
  const handleDismiss = useCallback(() => {
    if (!canDismiss) return;

    setIsDismissed(true);
    onDismiss?.();
  }, [canDismiss, onDismiss]);

  if (isDismissed) return null;

  return (
    <>
      <style>{styles}</style>
      <div
        className={`relative w-full bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-lg overflow-hidden transition-all duration-300 ad-bar-enter ${
          isSubtle ? 'my-2' : 'my-4'
        } ${isHovered && !isSubtle ? 'shadow-lg' : 'shadow-sm'}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
      <div className="flex items-center gap-3 p-3">
        {/* Image/Logo */}
        {campaign.imageUrl && (
          <div className="flex-shrink-0">
            <img
              src={campaign.imageUrl}
              alt={campaign.advertiserName}
              className="h-14 w-14 object-cover rounded-md"
            />
          </div>
        )}

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Publicité
            </span>
            {!isFreeUser && campaign.rewardPerClick > 0 && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                +{campaign.rewardPerClick} crédit
              </span>
            )}
          </div>
          <h4 className="font-semibold text-sm text-slate-900 truncate">
            {campaign.advertiserName}
          </h4>
          <p className="text-xs text-slate-600 line-clamp-2">
            {campaign.textContent}
          </p>
        </div>

        {/* Boutons */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <button
            onClick={handleCtaClick}
            className="inline-flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap"
          >
            {campaign.ctaText}
            <ExternalLink className="h-3 w-3" />
          </button>

          {canDismiss && (
            <button
              onClick={handleDismiss}
              className="p-2 hover:bg-slate-200 rounded-md text-slate-600 hover:text-slate-900 transition-colors"
              aria-label="Fermer la publicité"
              title="Fermer la publicité"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* Indicateur FREE user - pub non-supprimable */}
          {isFreeUser && (
            <div
              className="p-2 text-slate-400"
              title="Les utilisateurs gratuits ne peuvent pas fermer les publicités"
            >
              <VolumeX className="h-4 w-4" />
            </div>
          )}
        </div>
      </div>

      {/* Notification de récompense crédit */}
      {showCreditReward && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-lg">
          <div className="bg-white rounded-lg px-8 py-6 shadow-2xl text-center ad-reward-popup flex flex-col items-center gap-2">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-2">
              <Award className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-600">
              +{rewardAmount} crédit{rewardAmount > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-slate-500">
              Merci d&apos;avoir visionné cette publicité
            </p>
          </div>
        </div>
      )}

      {/* Badge GRATUIT pour FREE users */}
      {isFreeUser && (
        <div className="absolute top-3 right-3 inline-flex items-center gap-1 bg-orange-100/80 border border-orange-300 text-orange-700 text-[10px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm">
          <Clock className="w-3 h-3" />
          NON-SUPPRIMABLE
        </div>
      )}
    </div>
    </>
  );
}
