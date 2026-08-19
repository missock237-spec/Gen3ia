'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export interface StreamMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  timestamp: Date;
  adDisplayed?: boolean;
}

export interface UseChatStreamOptions {
  onChunk?: (chunk: string) => void;
  onAdDisplay?: () => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export function useChatStream(options: UseChatStreamOptions = {}) {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentChunk, setCurrentChunk] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const token = localStorage.getItem('genova_token');
    if (!token) return;

    const es = new EventSource(`/api/agents/stream?token=${token}`);

    es.addEventListener('agent-response', (event) => {
      const data = JSON.parse(event.data);
      setCurrentChunk(data.chunk);
      options.onChunk?.(data.chunk);

      if (data.adDisplay) {
        options.onAdDisplay?.();
      }

      if (data.done) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.chunk,
          id: `msg_${Date.now()}`,
          timestamp: new Date(),
        }]);
        setCurrentChunk('');
        setIsStreaming(false);
        options.onComplete?.();
      }
    });

    es.addEventListener('credit-update', (event) => {
      const data = JSON.parse(event.data);
      // Update credit store
    });

    es.addEventListener('agent-progress', (event) => {
      const data = JSON.parse(event.data);
      // Update progress UI
    });

    es.onerror = () => {
      console.error('[SSE] Connection error, reconnecting...');
    };

    eventSourceRef.current = es;
  }, [options]);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: StreamMessage = {
      role: 'user',
      content,
      id: `user_${Date.now()}`,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setCurrentChunk('');

    // Connecter SSE si pas déjà fait
    if (!eventSourceRef.current) {
      connectSSE();
    }

    // Envoyer le message à l'agent (POST)
    try {
      const token = localStorage.getItem('genova_token');
      const response = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message: content }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }
    } catch (err) {
      setIsStreaming(false);
      options.onError?.(err instanceof Error ? err : new Error('Unknown error'));
    }
  }, [connectSSE, options]);

  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
    setCurrentChunk('');
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentChunk('');
  }, []);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    messages,
    isStreaming,
    currentChunk,
    sendMessage,
    stopStreaming,
    clearMessages,
  };
}
