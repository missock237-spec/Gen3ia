'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [lang, setLang] = useState('fr');
  const [saved, setSaved] = useState(false);

  const langs = [
    { value: 'fr', label: 'Francais' }, { value: 'en', label: 'English' },
    { value: 'pt', label: 'Portugues' }, { value: 'ar', label: 'العربية' },
    { value: 'ha', label: 'Hausa' }, { value: 'sw', label: 'Kiswahili' },
  ];

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      {children}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Parametres</h1>
        {saved && <span className="text-green-400 text-sm">Enregistre</span>}
      </div>

      <Section title="Langue">
        <select value={lang} onChange={e => setLang(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
          {langs.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </Section>

      <Section title="Notifications">
        {['Email', 'Push', 'SMS'].map(n => (
          <label key={n} className="flex items-center justify-between py-2">
            <span className="text-gray-300 text-sm">{n}</span>
            <span className="text-gray-500 text-sm">Active</span>
          </label>
        ))}
      </Section>

      <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-medium transition">
        Enregistrer
      </button>
    </div>
  );
}
