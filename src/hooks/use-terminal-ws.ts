"use client";

import { useEffect, useRef, useCallback, useState } from "react";

type WSCallback = (data: any) => void;
type WSStatus = "connecting" | "connected" | "disconnected" | "error";

interface UseWSOptions {
  url: string;
  onMessage?: WSCallback;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event) => void;
  reconnectInterval?: number;
  maxRetries?: number;
}

/**
 * Hook WebSocket robuste avec reconnexion automatique
 * 
 * Utilisation :
 * const { send, status, lastMessage } = useTerminalWS({
 *   url: "ws://localhost:3001/terminal",
 *   onMessage: (data) => addLine(data),
 * });
 */
export function useTerminalWS(options: UseWSOptions) {
  const {
    url,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectInterval = 3000,
    maxRetries = 10,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [status, setStatus] = useState<WSStatus>("disconnected");
  const [lastMessage, setLastMessage] = useState<any>(null);
  const mountedRef = useRef(true);
  // Ref to break self-reference cycle (connect references itself via setTimeout).
  const connectRef = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        retryRef.current = 0;
        setStatus("connected");
        onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          onMessage?.(data);
        } catch {
          onMessage?.(event.data);
        }
      };

      ws.onclose = () => {
        setStatus("disconnected");
        onClose?.();

        // Reconnexion automatique
        if (mountedRef.current && retryRef.current < maxRetries) {
          retryRef.current++;
          timerRef.current = setTimeout(() => connectRef.current?.(), reconnectInterval);
        }
      };

      ws.onerror = (err) => {
        setStatus("error");
        onError?.(err);
      };
    } catch (_err) {
      setStatus("error");
      if (mountedRef.current && retryRef.current < maxRetries) {
        retryRef.current++;
        timerRef.current = setTimeout(() => connectRef.current?.(), reconnectInterval);
      }
    }
  }, [url, onMessage, onOpen, onClose, onError, reconnectInterval, maxRetries]);

  // Keep ref in sync for recursive setTimeout calls (must be in effect, not during render).
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === "string" ? data : JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const disconnect = useCallback(() => {
    mountedRef.current = false;
    clearTimeout(timerRef.current);
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const raf = requestAnimationFrame(() => connect()); return () => cancelAnimationFrame(raf);
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { send, status, lastMessage, disconnect, reconnect: connect };
}
