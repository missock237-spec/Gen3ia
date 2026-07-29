'use client';

export default function VoicePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">📞 Appels vocaux</h1>

      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <span className="text-5xl">📞</span>
          <div>
            <h2 className="text-lg font-semibold text-white">Agent vocal</h2>
            <p className="text-gray-400 text-sm">Configurez votre agent vocal pour répondre aux appels automatiquement</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {[
            { label: 'Modele vocal', value: 'alloy', options: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] },
            { label: 'Langue', value: 'fr-FR', options: ['fr-FR', 'en-US', 'pt-PT', 'ar-SA'] },
          ].map(s => (
            <div key={s.label}>
              <label className="text-sm text-gray-400 block mb-1">{s.label}</label>
              <select defaultValue={s.value} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
                {s.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          {[
            { label: 'Vitesse', value: '1.0', min: '0.5', max: '2.0' },
            { label: 'Hauteur', value: '1.0', min: '0.5', max: '1.5' },
          ].map(s => (
            <div key={s.label}>
              <label className="text-sm text-gray-400 block mb-1">{s.label}: {s.value}</label>
              <input type="range" min={s.min} max={s.max} step="0.1" defaultValue={s.value} className="w-full accent-blue-500" />
            </div>
          ))}
        </div>

        <button className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">
          Tester la voix
        </button>
      </div>

      <div className="text-center py-12 bg-gray-800/30 border border-gray-700/50 rounded-xl">
        <span className="text-4xl">📋</span>
        <h3 className="text-white font-medium mt-3">Aucun appel</h3>
        <p className="text-gray-400 text-sm mt-1">L'historique des appels apparaitra ici</p>
      </div>
    </div>
  );
}
