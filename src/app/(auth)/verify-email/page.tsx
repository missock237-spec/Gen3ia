'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Mail, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Token de vérification manquant');
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${token}`);
        const data = await res.json();

        if (res.ok) {
          setStatus('success');
          setMessage('Votre email a été vérifié avec succès !');
        } else {
          setStatus('error');
          setMessage(data.error || 'La vérification a échoué');
        }
      } catch {
        setStatus('error');
        setMessage('Erreur de connexion');
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md bg-card rounded-xl border border-border p-8 text-center shadow-lg">
        <div className="inline-flex items-center gap-2 text-2xl font-bold mb-6">
          <Sparkles className="h-6 w-6 text-primary" />
          <span>Genova AI</span>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Vérification de votre email...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <h1 className="text-xl font-bold">Email vérifié !</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Link href="/login" className="mt-4 px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Se connecter
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4">
            <XCircle className="h-12 w-12 text-destructive" />
            <h1 className="text-xl font-bold">Échec de la vérification</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Link href="/login" className="mt-4 text-sm text-primary hover:underline">
              Retour à la connexion
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
