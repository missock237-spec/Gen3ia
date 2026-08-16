'use client';

import { useState } from 'react';

export default function SupportPage() {
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);

  const faqs = [
    { q: 'Comment creer un agent ?', r: 'Allez dans Agents > Creer un agent. Donnez-lui un nom, un type et une description.' },
    { q: 'Comment recharger mes credits ?', r: 'Allez dans Facturation > Acheter des credits. Choisissez un pack.' },
    { q: 'Comment obtenir une cle API ?', r: 'Allez dans Cles API > Creer une cle. Copiez-la immediatement.' },
    { q: 'Quels moyens de paiement ?', r: 'Nous acceptons Orange Money, MTN Mobile Money, Airtel Money, Wave, et Stripe.' },
    { q: 'L\'application est-elle disponible en haoussa ?', r: 'Oui ! Nous supportons 6 langues dont le Haoussa et le Swahili.' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">💬 Support</h1>

      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">❓ Foire aux questions</h2>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <details key={i} className="group">
              <summary className="text-gray-300 text-sm py-2 px-3 bg-gray-700/30 rounded-lg cursor-pointer hover:bg-gray-700/50 transition list-none flex items-center justify-between">
                {faq.q}
                <span className="text-gray-500 group-open:rotate-180 transition">▼</span>
              </summary>
              <p className="text-gray-400 text-sm mt-2 px-3 pb-2">{faq.r}</p>
            </details>
          ))}
        </div>
      </div>

      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">📧 Nous contacter</h2>
        <textarea
          placeholder="Decrivez votre probleme..."
          value={msg} onChange={e => setMsg(e.target.value)}
          rows={4}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none mb-3"
        />
        <button
          onClick={() => { setSent(true); setMsg(''); }}
          disabled={!msg}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition"
        >
          {sent ? 'Message envoyé !' : 'Envoyer'}
        </button>
        {sent && <p className="text-green-400 text-xs mt-2">Nous vous repondrons sous 24h.</p>}
      </div>
    </div>
  );
}
