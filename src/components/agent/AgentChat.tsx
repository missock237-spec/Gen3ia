'use client';

import React, { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  agent?: boolean;
  action?: any;
  timestamp: Date;
  requiresApproval?: boolean;
  approvalId?: string;
  requiresAuth?: boolean;
  oauthUrl?: string;
  platform?: string;
}

const SUGGESTIONS = [
  'Cherche les dernières actualités tech',
  'Envoie un email à test@email.com',
  'Va sur google.com',
  'Crée un événement dans mon calendrier demain',
  'Liste mes emails non lus',
  'Extrais le contenu de cette page',
];

export default function AgentChat({ userId = 'user_' + Date.now() }) {
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', text: '🧠 **Agent Genova** activé ! Je peux agir sur le web et tes comptes personnels pour toi.\n\nDis-moi ce que tu veux que je fasse.', isUser: false, agent: true, timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { id: Date.now().toString(), text: input, isUser: true, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const response = await fetch('/api/agent/instruct', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, instruction: input }),
      });
      const data = await response.json();
      const agentMsg: Message = {
        id: 'res_' + Date.now(), text: '', isUser: false, agent: true, timestamp: new Date(),
        requiresAuth: data.requiresAuth, requiresApproval: data.requiresApproval,
        approvalId: data.approvalId, oauthUrl: data.oauthUrl, platform: data.platform, action: data,
      };
      if (data.error) agentMsg.text = '❌ **Erreur :** ' + data.error;
      else if (data.requiresAuth) agentMsg.text = '🔐 **Connexion requise !**\n\nJ\'ai besoin d\'accéder à **' + data.platform + '** pour faire ça.';
      else if (data.requiresApproval) agentMsg.text = '⚠️ **Action risquée**\n\nJe dois ' + data.action + ' sur ' + data.platform + '.';
      else agentMsg.text = '✅ **Terminé !**\n\n' + JSON.stringify(data, null, 2).substring(0, 400);
      setMessages(prev => [...prev, agentMsg]);
    } catch (e: any) {
      setMessages(prev => [...prev, { id: 'err_' + Date.now(), text: '❌ **Erreur réseau**\n\n' + e.message, isUser: false, agent: true, timestamp: new Date() }]);
    } finally { setLoading(false); }
  };

  const handleApprove = async (approvalId: string, approved: boolean) => {
    setLoading(true);
    try {
      const response = await fetch('/api/agent/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, approvalId, approved }),
      });
      const data = await response.json();
      setMessages(prev => [...prev, { id: 'app_' + Date.now(), text: approved ? '✅ Approuvé' : '❌ Rejeté', isUser: false, agent: true, timestamp: new Date() }]);
      if (data.status === 'completed') setMessages(prev => [...prev, { id: 'res2_' + Date.now(), text: '✅ **Action exécutée !**', isUser: false, agent: true, timestamp: new Date() }]);
    } catch { }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-lg">🧠</div>
          <div>
            <h2 className="font-bold text-lg">Agent Autonome Genova</h2>
            <p className="text-sm text-white/70">Peut agir sur le web et tes comptes personnels</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={'flex ' + (msg.isUser ? 'justify-end' : 'justify-start')}>
            <div className={'max-w-[85%] rounded-2xl p-4 ' + (msg.isUser ? 'bg-indigo-500 text-white' : msg.agent ? 'bg-white shadow-sm border border-gray-100' : 'bg-gray-100')}>
              {msg.agent && <div className="text-xs text-indigo-500 font-semibold mb-1">🧠 Agent Genova</div>}
              <div className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
              {msg.requiresAuth && msg.oauthUrl && (
                <a href={msg.oauthUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-600 transition">
                  🔗 Autoriser l'accès à {msg.platform}
                </a>
              )}
              {msg.requiresApproval && msg.approvalId && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => handleApprove(msg.approvalId!, true)} className="bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-600 transition flex-1">✅ Approuver</button>
                  <button onClick={() => handleApprove(msg.approvalId!, false)} className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-600 transition flex-1">❌ Rejeter</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white shadow-sm border border-gray-100 rounded-2xl p-4">
              <div className="text-xs text-indigo-500 font-semibold mb-1">🧠 Agent Genova</div>
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 py-2 border-t border-gray-100 flex gap-2 overflow-x-auto">
        {SUGGESTIONS.slice(0, 3).map((s, i) => (
          <button key={i} onClick={() => setInput(s)} className="text-xs bg-gray-100 hover:bg-indigo-50 hover:text-indigo-600 px-3 py-1.5 rounded-full whitespace-nowrap transition text-gray-500">{s}</button>
        ))}
      </div>

      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Dis-moi ce que tu veux que je fasse..."
            className="flex-1 bg-gray-100 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button onClick={sendMessage} disabled={loading}
            className="bg-indigo-500 text-white rounded-xl px-5 py-3 font-medium hover:bg-indigo-600 transition disabled:opacity-50">
            {loading ? '...' : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  );
}
