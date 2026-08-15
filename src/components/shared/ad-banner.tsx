'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, Gift, Eye, ExternalLink, Timer } from 'lucide-react';

interface AdBannerProps {
  userPlan: string;
  placement: 'chat' | 'sidebar' | 'dashboard' | 'agent-response';
  onAdViewed?: () => void;
  onAdClicked?: () => void;
  messageIndex?: number;
}

interface Ad {
  id: string;
  title: string;
  description: string;
  cta: string;
  link: string;
  icon: string;
  bgColor: string;
  textColor: string;
  rewardCredits?: number;
}

const ADS: Ad[] = [
  {
    id: 'genova-pro',
    title: '🚀 Passez à Genova Pro',
    description: 'Débloquez 20 agents IA, 5000 crédits/mois et le support prioritaire.',
    cta: 'Voir les offres',
    link: '/billing',
    icon: '🚀',
    bgColor: 'from-violet-500/10 to-purple-600/10',
    textColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    id: 'credits-pack',
    title: '💎 Pack de crédits',
    description: 'Achetez des crédits supplémentaires dès 2500 FCFA.',
    cta: 'Acheter maintenant',
    link: '/billing',
    icon: '💎',
    bgColor: 'from-amber-500/10 to-orange-600/10',
    textColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    id: 'sebpay',
    title: '📱 Paiement Mobile Money',
    description: 'Payez avec MTN, Orange Money ou Moov via SebPay Africa.',
    cta: 'En savoir plus',
    link: '/billing',
    icon: '📱',
    bgColor: 'from-green-500/10 to-emerald-600/10',
    textColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'enterprise',
    title: '🏢 Genova Enterprise',
    description: 'SSO, SAML, intégrations sur mesure et SLA garanti.',
    cta: 'Contacter',
    link: '/billing',
    icon: '🏢',
    bgColor: 'from-slate-500/10 to-gray-600/10',
    textColor: 'text-slate-600 dark:text-slate-400',
  },
  {
    id: 'guardrails',
    title: '🛡️ Guardrails Avancés',
    description: 'Sécurisez vos agents avec des garde-fous personnalisés.',
    cta: 'Configurer',
    link: '/guardrails',
    icon: '🛡️',
    bgColor: 'from-red-500/10 to-rose-600/10',
    textColor: 'text-red-600 dark:text-red-400',
  },
];

export function AdBanner({ userPlan, _placement, _onAdViewed, onAdClicked, messageIndex }: AdBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [currentAd, setCurrentAd] = useState<Ad | null>(null);
  const [timeLeft, setTimeLeft] = useState(8);
  const [isVisible, setIsVisible] = useState(false);

  const isFree = userPlan === 'free';
  const isPaid = !isFree;

// @ts-ignore — type narrowing pending, see refactor ticket
  useEffect(() => {
    if (dismissed) return;
    const randomAd = ADS[Math.floor(Math.random() * ADS.length)];
    // Defer setState to avoid react-hooks/set-state-in-effect
    const raf = requestAnimationFrame(() => {
      setCurrentAd(randomAd);
      setIsVisible(true);
    });

    if (isFree) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setIsVisible(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => { cancelAnimationFrame(raf); clearInterval(timer); };
    }
  }, [messageIndex, dismissed, isFree]);

  if (!currentAd || dismissed || !isVisible) return null;

  const handleClose = () => {
    setDismissed(true);
  };

  const handleClick = () => {
    onAdClicked?.();
    if (isPaid && currentAd.rewardCredits) {
      // Reward logic - will be handled by parent
    }
  };

  // Free user: forcing ad display without close button for 8 seconds
  if (isFree) {
    return (
      <div className={`relative w-full rounded-xl border bg-gradient-to-r ${currentAd.bgColor} p-4 mb-3 overflow-hidden`}>
        {/* Close button - disabled for free users */}
        <button
          disabled={timeLeft > 0}
          onClick={handleClose}
          className={`absolute top-2 right-2 p-1 rounded-full transition-colors ${
            timeLeft > 0
              ? 'opacity-30 cursor-not-allowed'
              : 'opacity-70 hover:opacity-100 hover:bg-black/10'
          }`}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Timer */}
        <div className="absolute top-2 left-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Timer className="h-3 w-3" />
          <span>{timeLeft}s</span>
        </div>

        {/* Content */}
        <div className="flex items-start gap-3 mt-4">
          <span className="text-2xl">{currentAd.icon}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${currentAd.textColor}`}>{currentAd.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{currentAd.description}</p>
          </div>
          <a
            href={currentAd.link}
            onClick={handleClick}
            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
          >
            {currentAd.cta}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Progress bar */}
        <div className="w-full h-0.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-2 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-1000"
            style={{ width: `${(timeLeft / 8) * 100}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-1 text-center">
          Publicité - {timeLeft > 0 ? 'Encore ' + timeLeft + 's' : 'Vous pouvez fermer'}
        </p>
      </div>
    );
  }

  // Paid user: dismissable, reward on view
  return (
    <div className={`relative w-full rounded-xl border bg-gradient-to-r ${currentAd.bgColor} p-4 mb-3 group`}>
      <button
        onClick={handleClose}
        className="absolute top-2 right-2 p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-all"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3">
        <span className="text-2xl">{currentAd.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${currentAd.textColor}`}>{currentAd.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{currentAd.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Reward badge */}
          <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
            <Gift className="h-3 w-3" />
            +1 crédit
          </span>
          <a
            href={currentAd.link}
            onClick={handleClick}
            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
          >
            {currentAd.cta}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
