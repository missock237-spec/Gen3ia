'use client';

/**
 * GenovaLogo — Logo Gen3ia
 *
 * Affiche le logo officiel Gen3ia (hexagone cyan avec cristal central)
 * accompagné optionnellement du texte de marque.
 * Le logo est servi depuis /logo.png — déployé dans /public/.
 */

import Image from 'next/image';
import { cn } from '@/lib/utils';

interface GenovaLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  compact?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: { container: 'h-8 w-8', text: 'text-sm', subtitle: 'text-[10px]' },
  md: { container: 'h-12 w-12', text: 'text-2xl', subtitle: 'text-sm' },
  lg: { container: 'h-16 w-16', text: 'text-3xl', subtitle: 'text-base' },
  xl: { container: 'h-20 w-20', text: 'text-4xl', subtitle: 'text-lg' },
} as const;

export function GenovaLogo({ size = 'md', showText = false, compact = false, className }: GenovaLogoProps) {
  const s = SIZE_MAP[size];

  return (
    <div className={cn('inline-flex items-center gap-2', compact ? 'gap-1.5' : 'gap-3', className)}>
      {/* Logo mark — image officielle */}
      <div
        className={cn(
          'inline-flex items-center justify-center rounded-xl flex-shrink-0 overflow-hidden',
          compact ? '' : 'rounded-2xl',
          s.container,
        )}
      >
        <Image
          src="/logo.png"
          alt="Gen3ia"
          width={96}
          height={96}
          className="h-full w-full object-cover"
          priority
        />
      </div>

      {/* Texte marque */}
      {showText && (
        <div className="flex flex-col min-w-0">
          <span
            className={cn('font-bold tracking-tight text-foreground leading-none', s.text)}
          >
            Gen<span className="text-primary">3ia</span>
          </span>
          {!compact && (
            <span className={cn('text-muted-foreground mt-0.5', s.subtitle)}>
              Système d&apos;exploitation pour agents IA
            </span>
          )}
          {compact && (
            <span className={cn('text-muted-foreground', s.subtitle)}>
              AI Operating System
            </span>
          )}
        </div>
      )}
    </div>
  );
}
