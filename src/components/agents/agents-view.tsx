'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Gift, Timer, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { AdProvider, useAdContext } from '@/components/shared/ad-context';
import { AdBanner } from '@/components/shared/ad-banner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

interface Agent {
  id: string;
  name: string;
  type: string;
  status: string;
}

function ChatMessages() {
  const { user } = useAuthStore();
  const { incMessageCount, trackAdEvent, creditBalance, lastRewardMessage, rewardStats } = useAdContext();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'agent',
      content: "Bonjour ! Je suis votre assistant Gen3ia. Comment puis-je vous aider aujourd'hui ?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userPlan = user?.plan || 'free';
  const isPaid = userPlan !== 'free';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Charger les agents disponibles
  useEffect(() => {
    fetch('/api/agents')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : data?.agents || [];
        setAgents(list);
        if (list.length > 0) setSelectedAgent(list[0].id);
      })
      .catch(() => {});
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setError(null);
    incMessageCount();

    try {
      const chatUrl = selectedAgent ? `/api/agents/${selectedAgent}/chat` : '/api/agents/chat';
      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'credentials': 'include' },
        body: JSON.stringify({
          message: input,
          agentId: selectedAgent,
          conversationId: localStorage.getItem('gen3ia_conversation_id') || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erreur ${res.status}`);
      }

      const data = await res.json();

      // Sauvegarder l'ID de conversation pour continuer le fil
      if (data.conversationId) {
        localStorage.setItem('gen3ia_conversation_id', data.conversationId);
      }

      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: data.response || data.content || "[L'agent a répondu]",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, agentMsg]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Erreur de communication';
      setError(errMsg);

      // Fallback : message local
      const fallbackMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: `Désolé, je n'ai pas pu contacter le serveur : ${errMsg}. Veuillez réessayer.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, fallbackMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const remainingToday = rewardStats.maxPerDay - rewardStats.balance.today;

  return (
    <div className="flex flex-col h-full">
      {isPaid && (
        <div className="flex items-center justify-between px-4 py-2 border-b bg-gradient-to-r from-emerald-500/5 to-green-500/5">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <strong>{creditBalance.total}</strong> crédit{creditBalance.total > 1 ? 's' : ''} gagné{creditBalance.total > 1 ? 's' : ''}
            </span>
            {remainingToday > 0 && (
              <span className="text-[10px] text-muted-foreground">({remainingToday} dispo)</span>
            )}
          </div>
        </div>
      )}

      {lastRewardMessage && (
        <div className="px-4 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20 text-center">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-3 w-3 inline mr-1" />
            {lastRewardMessage}
          </span>
        </div>
      )}

      {/* Sélecteur d'agent */}
      {agents.length > 0 && (
        <div className="flex gap-2 px-4 py-2 border-b border-border overflow-x-auto">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedAgent === agent.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              <Bot className="h-3 w-3 inline mr-1" />
              {agent.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mx-4 mt-2 py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={msg.id}>
            <div className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'agent' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <p className="text-[10px] mt-1 opacity-50">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
            {msg.role === 'agent' && idx > 0 && (
              <div className="ml-11 mt-2">
                <AdBanner
                  userPlan={userPlan}
                  placement="agent-response"
                  messageIndex={idx}
                  onAdViewed={() => trackAdEvent(`ad_response_${idx}`, 'view', userPlan)}
                  onAdClicked={() => trackAdEvent(`ad_response_${idx}`, 'click', userPlan)}
                />
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Écrivez votre message à l'agent..."
            className="flex-1 min-h-[44px] max-h-32 rounded-xl border bg-background px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="h-[44px] w-[44px] rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center transition-colors"
          >
            {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentsView() {
  return (
    <AdProvider>
      <div className="flex flex-col h-[calc(100vh-12rem)]">
        <div className="flex-1 rounded-xl border bg-card overflow-hidden">
          <ChatMessages />
        </div>
      </div>
    </AdProvider>
  );
}
