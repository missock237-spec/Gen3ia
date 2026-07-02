import Link from 'next/link';
import { GenovaLogo } from '@/components/ui/genova-logo';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center gradient-bg grid-pattern">
      <div className="flex flex-col items-center gap-6 p-8 rounded-2xl bg-background/50 backdrop-blur-xl border border-border shadow-2xl text-center max-w-md">
        <GenovaLogo size="lg" showText={true} />
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tighter">404</h1>
          <p className="text-xl font-medium text-muted-foreground">Page non trouvée</p>
        </div>
        <p className="text-muted-foreground">
          Désolé, la page que vous recherchez n'existe pas ou a été déplacée.
        </p>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
