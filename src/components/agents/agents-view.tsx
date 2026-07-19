'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { AdProvider, useAdContext } from '@/components/shared/ad-context';
import { AdBanner } from '@/components/shared/ad-banner';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

function ChatMessages() {
  const { user } = useAuthStore();
  const { incMessageCount, trackAdEvent, totalRewards } = useAdContext();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'agent',
      content: 'Bonjour ! Je suis votre assistant Genova AI. Comment puis-je vous aider aujourd\'hui ?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userPlan = user?.plan || 'free';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    incMessageCount();

    // Simulate agent response
    setTimeout(() => {
      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: `J'ai bien reçu votre message. Je travaille sur votre demande. (Simulation - connexion API à venir)`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, agentMsg]);
      setIsTyping(false);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header avec récompenses */}
      {userPlan !== 'free' && totalRewards > 0 && (
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-b bg-gradient-to-r from-emerald-500/5 to-green-500/5">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {totalRewards} crédit{totalRewards > 1 ? 's' : ''} gagné{totalRewards > 1 ? 's' : ''} en consultant les pubs
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={msg.id}>
            <div className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'agent' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-muted rounded-tl-sm'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <p className="text-[10px] mt-1 opacity-50">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>

            {/* 🎯 PUB APRÈS CHAQUE RÉPONSE DE L'AGENT (sauf le message de bienvenue) */}
            {msg.role === 'agent' && idx > 0 && (
              <div className="ml-11 mt-2">
                <AdBanner
                  userPlan={userPlan}
                  placement="agent-response"
                  messageIndex={idx}
                  onAdViewed={() => trackAdEvent(`ad_response_${idx}`, 'view')}
                  onAdClicked={() => trackAdEvent(`ad_response_${idx}`, 'click')}
                />
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
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

      {/* Input */}
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
            className="h-[44px] w-[44px] rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentsView() {
  const { user } = useAuthStore();

  return (
    <AdProvider userPlan={user?.plan || 'free'}>
      <div className="flex flex-col h-[calc(100vh-12rem)]">
        <div className="flex-1 rounded-xl border bg-card overflow-hidden">
          <ChatMessages />
        </div>
      </div>
    </AdProvider>
  );
}
