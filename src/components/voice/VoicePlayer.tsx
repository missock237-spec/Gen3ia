'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Volume2 } from 'lucide-react';

interface VoicePlayerProps {
  audioData: string | Buffer; // Base64 or buffer
  duration?: number;
  emotion?: string;
  className?: string;
}

export function VoicePlayer({ audioData, duration = 0, emotion, className = '' }: VoicePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(100);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    // Convert base64 to blob if needed
    if (typeof audioData === 'string') {
      const binaryString = atob(audioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/wav' });
      audioRef.current.src = URL.createObjectURL(blob);
    } else {
      const blob = new Blob([audioData], { type: 'audio/wav' });
      audioRef.current.src = URL.createObjectURL(blob);
    }

    audioRef.current.volume = volume / 100;
  }, [audioData, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex flex-col gap-3 p-4 bg-slate-50 rounded-lg ${className}`}>
      {emotion && (
        <div className="text-xs text-slate-600">
          Emotion: <span className="font-semibold capitalize">{emotion}</span>
        </div>
      )}
      
      <div className="flex items-center gap-3">
        <Button
          onClick={togglePlay}
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </Button>

        <div className="flex-1">
          <Slider
            value={[currentTime]}
            onValueChange={handleSeek}
            max={duration || 0}
            step={0.1}
            className="w-full"
          />
        </div>

        <span className="text-xs text-slate-600 font-mono min-w-fit">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Volume2 className="w-4 h-4 text-slate-600" />
        <Slider
          value={[volume]}
          onValueChange={(value) => setVolume(value[0])}
          max={100}
          step={1}
          className="w-24"
        />
      </div>
    </div>
  );
}
