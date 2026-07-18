import { Metadata } from 'next';
import CodeStudio from '@/components/code-studio/CodeStudio';

export const metadata: Metadata = {
  title: 'CodeStudio - Genova AI',
  description: 'Editeur de code et sandbox securise integre au SaaS',
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          <a href="/" className="hover:text-foreground transition-colors">Accueil</a>
          <span>/</span>
          <span className="text-foreground">CodeStudio</span>
        </div>
      </div>
      
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur-sm p-1">
        <div className="rounded-xl bg-background p-6">
          <CodeStudio />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl mb-2">🛡️</div>
          <h3 className="font-semibold text-sm mb-1">Sandbox securise</h3>
          <p className="text-xs text-muted-foreground">
            Execution isolee avec timeout, quota et blocage des patterns dangereux
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl mb-2">📊</div>
          <h3 className="font-semibold text-sm mb-1">Analyse en direct</h3>
          <p className="text-xs text-muted-foreground">
            Stats, duree, tokens et fonctionnalites detectees automatiquement
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl mb-2">🔌</div>
          <h3 className="font-semibold text-sm mb-1">API REST disponible</h3>
          <p className="text-xs text-muted-foreground">
            <code className="text-primary">POST /api/code/execute</code> pour vos outils externes
          </p>
        </div>
      </div>
    </div>
  );
}