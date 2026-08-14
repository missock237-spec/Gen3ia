# Audio & Image System Integration Examples

Complete examples of how to integrate the voice and image systems into your agents and applications.

## Setup

### 1. Environment Configuration

```env
# .env.local
HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxxxxxxxxxx
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

### 2. Install Dependencies

```bash
npm install @huggingface/inference
```

### 3. Initialize Database

```bash
npx prisma db push
npx prisma generate
```

## Quick Start Examples

### Basic Voice Recording & Transcription

```typescript
// app/page.tsx
'use client';

import { useState } from 'react';
import { VoiceRecorder } from '@/components/voice/VoiceRecorder';
import { VoicePlayer } from '@/components/voice/VoicePlayer';

export default function VoiceDemo() {
  const [transcription, setTranscription] = useState<string>('');
  const [emotion, setEmotion] = useState<string>('');
  const [audioData, setAudioData] = useState<string | null>(null);

  const handleRecordingComplete = async (audioBuffer: ArrayBuffer) => {
    const formData = new FormData();
    formData.append('audio', new Blob([audioBuffer], { type: 'audio/wav' }), 'recording.wav');
    formData.append('userId', 'user-123');

    const response = await fetch('/api/voice/transcribe', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (data.success) {
      setTranscription(data.data.text);
      setEmotion(data.data.emotion.detected);
      
      // Synthesize response
      const synthResponse = await fetch('/api/voice/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `You said: ${data.data.text}`,
          emotion: data.data.emotion.detected,
        }),
      });

      const synthData = await synthResponse.json();
      if (synthData.success) {
        setAudioData(synthData.data.audio);
      }
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <VoiceRecorder onRecordingComplete={handleRecordingComplete} />
      
      {transcription && (
        <div className="p-4 bg-blue-50 rounded">
          <p className="text-sm font-semibold">Transcription:</p>
          <p>{transcription}</p>
          <p className="text-xs text-slate-600 mt-2">Emotion: {emotion}</p>
        </div>
      )}

      {audioData && <VoicePlayer audioData={audioData} emotion={emotion} />}
    </div>
  );
}
```

### Image Generation Demo

```typescript
// app/generate/page.tsx
'use client';

import { ImageGenerator } from '@/components/image/ImageGenerator';

export default function GeneratorPage() {
  const handleImageGenerated = (imageData: string) => {
    console.log('Image generated:', imageData);
    // Save to database or use in your app
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Image Generator</h1>
      <ImageGenerator onGenerateComplete={handleImageGenerated} agentId="agent-1" />
    </div>
  );
}
```

### Agent with Voice Response

```typescript
// app/agent/page.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VoicePlayer } from '@/components/voice/VoicePlayer';

export default function AgentPage() {
  const [input, setInput] = useState('');
  const [audioResponse, setAudioResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!input) return;

    setLoading(true);
    try {
      const response = await fetch('/api/agent/voice-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'my-agent',
          responseText: input,
          emotion: 'happy',
          language: 'en',
        }),
      });

      const data = await response.json();
      if (data.success) {
        setAudioResponse(data.data.audio);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
        />
        <Button onClick={handleSendMessage} disabled={loading}>
          Send
        </Button>
      </div>

      {audioResponse && <VoicePlayer audioData={audioResponse} emotion="happy" />}
    </div>
  );
}
```

### Create User Voice Profile

```typescript
// app/settings/voice/page.tsx
'use client';

import { useState } from 'react';
import { VoiceRecorder } from '@/components/voice/VoiceRecorder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function VoiceProfileSettings() {
  const [profileName, setProfileName] = useState('My Voice');
  const [audioBuffer, setAudioBuffer] = useState<ArrayBuffer | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleCreateProfile = async () => {
    if (!audioBuffer) {
      alert('Please record audio first');
      return;
    }

    setIsCreating(true);
    try {
      const formData = new FormData();
      formData.append('audio', new Blob([audioBuffer], { type: 'audio/wav' }), 'voice.wav');
      formData.append('userId', 'user-123'); // Get from auth
      formData.append('profileName', profileName);
      formData.append('isDefault', 'true');

      const response = await fetch('/api/voice/profile', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Create Voice Profile</h1>

      <div>
        <label className="text-sm font-semibold">Profile Name</label>
        <Input
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          placeholder="e.g., My Professional Voice"
        />
      </div>

      <div>
        <label className="text-sm font-semibold">Record Sample</label>
        <VoiceRecorder
          onRecordingComplete={setAudioBuffer}
          maxDuration={30}
        />
      </div>

      <Button onClick={handleCreateProfile} disabled={!audioBuffer || isCreating}>
        {isCreating ? 'Creating...' : 'Create Profile'}
      </Button>

      {success && (
        <div className="p-3 bg-green-50 text-green-700 text-sm rounded">
          Voice profile created successfully!
        </div>
      )}
    </div>
  );
}
```

## Backend Integration

### Server-Side Voice Processing

```typescript
// lib/voice-service.ts
import { transcribeAudio, synthesizeText } from '@/lib/stt/huggingface-stt';
import { detectEmotion, analyzeVoiceCharacteristics } from '@/lib/voice';
import { db } from '@/lib/db';

export async function processUserVoiceMessage(
  userId: string,
  audioBuffer: Buffer
) {
  // Transcribe
  const transcription = await transcribeAudio(audioBuffer, {
    punctuation: true,
  });

  // Analyze voice
  const audioData = new Float32Array(audioBuffer);
  const characteristics = await analyzeVoiceCharacteristics(audioData, 16000);
  const emotion = detectEmotion(characteristics);

  // Store in database
  const recording = await db.voiceRecording.create({
    data: {
      userId,
      voiceProfileId: 'default',
      audioData,
      duration: transcription.duration,
      transcribedText: transcription.text,
      language: transcription.language,
      detectedEmotion: emotion.emotion,
      emotionScores: JSON.stringify(emotion.scores),
      emotionIntensity: emotion.intensity,
    },
  });

  return {
    text: transcription.text,
    emotion: emotion.emotion,
    confidence: emotion.confidence,
    recordingId: recording.id,
  };
}
```

### Agent Integration

```typescript
// lib/agent-voice-handler.ts
import { AgentVoiceManager } from '@/lib/voice/agent-voice-integration';
import { synthesizeText } from '@/lib/tts/huggingface-tts';

export async function getAgentVoiceResponse(
  agentId: string,
  responseText: string,
  userEmotion?: string
) {
  const config = AgentVoiceManager.createAgentVoiceConfig(agentId, agentId);
  
  // Determine emotion response
  const emotion = userEmotion === 'sad' ? 'calm' : 'neutral';

  const response = await AgentVoiceManager.generateVoiceResponse(
    agentId,
    responseText,
    config,
    {
      emotion: emotion as any,
      confidence: 0.9,
      scores: {
        neutral: emotion === 'neutral' ? 1 : 0,
        happy: 0,
        sad: emotion === 'calm' ? 0.5 : 0,
        angry: 0,
        surprised: 0,
        fearful: 0,
        disgusted: 0,
      },
      intensity: 0.5,
      characteristics: {
        pitchVariation: 'medium',
        energyLevel: 'medium',
        speechRate: 'normal',
      },
    }
  );

  return {
    audio: response.audio,
    duration: response.duration,
    emotion: response.emotion.emotion,
  };
}
```

### Batch Image Generation

```typescript
// lib/batch-image-service.ts
import { generateImageBatch } from '@/lib/image/huggingface-image';
import { db } from '@/lib/db';

export async function generateAgentVisuals(
  agentId: string,
  promptTemplates: string[]
) {
  // Generate batch
  const result = await generateImageBatch(promptTemplates, {
    width: 512,
    height: 512,
    model: 'flux',
  });

  // Store results
  const batch = await db.imageBatch.create({
    data: {
      agentId,
      userId: 'system',
      prompts: JSON.stringify(promptTemplates),
      count: promptTemplates.length,
      successCount: result.images.length,
      failureCount: result.failureCount,
      status: 'completed',
    },
  });

  // Store individual images
  for (const image of result.images) {
    await db.imageGeneration.create({
      data: {
        userId: 'system',
        agentId,
        prompt: '', // Map from promptTemplates
        imageData: image.image,
        width: image.width,
        height: image.height,
        generationTime: image.generationTime,
      },
    });
  }

  return batch;
}
```

## Advanced Patterns

### Real-time Conversation with Voice

```typescript
// app/voice-chat/page.tsx
'use client';

import { useState, useRef } from 'react';
import { VoiceRecorder } from '@/components/voice/VoiceRecorder';
import { VoicePlayer } from '@/components/voice/VoicePlayer';

export default function VoiceChatPage() {
  const [messages, setMessages] = useState<Array<{
    role: 'user' | 'agent';
    text: string;
    audio?: string;
    emotion: string;
  }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleUserAudio = async (audioBuffer: ArrayBuffer) => {
    setIsProcessing(true);
    try {
      // Transcribe user audio
      const formData = new FormData();
      formData.append('audio', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
      formData.append('userId', 'user-123');

      const transcribeRes = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData,
      });

      const transcribeData = await transcribeRes.json();
      
      // Add user message
      setMessages(prev => [...prev, {
        role: 'user',
        text: transcribeData.data.text,
        emotion: transcribeData.data.emotion.detected,
      }]);

      // Get agent response
      const agentRes = await fetch('/api/agent/voice-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'my-agent',
          responseText: `Response to: ${transcribeData.data.text}`,
          emotion: 'happy',
        }),
      });

      const agentData = await agentRes.json();

      // Add agent message
      setMessages(prev => [...prev, {
        role: 'agent',
        text: agentData.data.text,
        audio: agentData.data.audio,
        emotion: agentData.data.emotion,
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Voice Chat with Agent</h1>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {messages.map((msg, idx) => (
          <div key={idx} className={`p-4 rounded ${msg.role === 'user' ? 'bg-blue-50' : 'bg-green-50'}`}>
            <p className="font-semibold">{msg.role === 'user' ? 'You' : 'Agent'}</p>
            <p>{msg.text}</p>
            {msg.audio && <VoicePlayer audioData={msg.audio} emotion={msg.emotion} />}
          </div>
        ))}
      </div>

      <VoiceRecorder
        onRecordingComplete={handleUserAudio}
        disabled={isProcessing}
      />
    </div>
  );
}
```

### Voice Profile Training

```typescript
// app/training/voice-profile.tsx
'use client';

import { useState } from 'react';
import { VoiceRecorder } from '@/components/voice/VoiceRecorder';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

const TRAINING_PHRASES = [
  'Hello, my name is Alice',
  'I enjoy talking to AI assistants',
  'The weather today is beautiful',
  'Please help me with this task',
  'Thank you for your assistance',
];

export default function VoiceProfileTraining() {
  const [currentPhrase, setCurrentPhrase] = useState(0);
  const [recordings, setRecordings] = useState<ArrayBuffer[]>([]);
  const [isTraining, setIsTraining] = useState(false);

  const handleRecording = async (audioBuffer: ArrayBuffer) => {
    const newRecordings = [...recordings, audioBuffer];
    setRecordings(newRecordings);

    if (newRecordings.length < TRAINING_PHRASES.length) {
      setCurrentPhrase(newRecordings.length);
    } else {
      // Complete training
      await completeTraining(newRecordings);
    }
  };

  const completeTraining = async (recordings: ArrayBuffer[]) => {
    setIsTraining(true);
    try {
      // Process all recordings
      for (const audio of recordings) {
        const formData = new FormData();
        formData.append('audio', new Blob([audio], { type: 'audio/wav' }), 'training.wav');
        formData.append('userId', 'user-123');
        formData.append('profileName', 'Trained Profile');

        await fetch('/api/voice/profile', {
          method: 'POST',
          body: formData,
        });
      }

      alert('Voice profile training complete!');
    } finally {
      setIsTraining(false);
    }
  };

  const progress = (recordings.length / TRAINING_PHRASES.length) * 100;

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold">Voice Profile Training</h2>
        <p className="text-sm text-slate-600">
          Record {TRAINING_PHRASES.length} phrases to train your voice profile
        </p>
      </div>

      <Progress value={progress} />

      <div className="p-4 bg-blue-50 rounded">
        <p className="text-sm text-slate-600">Phrase {currentPhrase + 1}/{TRAINING_PHRASES.length}</p>
        <p className="text-lg font-semibold">{TRAINING_PHRASES[currentPhrase]}</p>
      </div>

      {currentPhrase < TRAINING_PHRASES.length && (
        <VoiceRecorder onRecordingComplete={handleRecording} disabled={isTraining} />
      )}

      {recordings.length === TRAINING_PHRASES.length && (
        <Button disabled className="w-full">Training Complete!</Button>
      )}
    </div>
  );
}
```

These examples provide a complete integration pattern for adding voice and image capabilities to your application!
