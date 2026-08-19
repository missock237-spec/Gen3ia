# Advanced Audio, Voice, and Image System

Complete implementation of voice recognition, text-to-speech, voice profiling, emotion detection, and image generation using Hugging Face free models.

## System Architecture

### Components

#### 1. Voice Fingerprinting & Speaker Identification
**File:** `src/lib/voice/fingerprint/speaker-analyzer.ts`

Analyzes audio characteristics to identify and distinguish speakers:
- **Pitch Detection**: Autocorrelation-based fundamental frequency estimation
- **Energy Analysis**: RMS calculation for loudness measurement
- **Spectral Analysis**: FFT-based spectral centroid calculation
- **MFCC**: Mel-frequency cepstral coefficients (13 coefficients)
- **Voice Quality**: Zero-crossing rate, jitter, and shimmer analysis

**Usage:**
```typescript
import { analyzeVoiceCharacteristics, calculateVoiceDistance } from '@/lib/voice/fingerprint/speaker-analyzer';

const audioBuffer = new Float32Array([...]); // 16-bit PCM audio
const characteristics = await analyzeVoiceCharacteristics(audioBuffer, 16000);

console.log(characteristics.pitch); // Hz
console.log(characteristics.energy); // dB
console.log(characteristics.mfcc); // 13 coefficients
```

#### 2. Emotion Detection
**File:** `src/lib/voice/emotion/emotion-detector.ts`

Detects emotional state from voice characteristics:
- **Emotions Detected**: neutral, happy, sad, angry, surprised, fearful, disgusted
- **Scoring System**: Multi-feature analysis with confidence scores
- **Intensity Measurement**: 0-1 scale of emotion intensity
- **Characteristic Analysis**: Pitch variation, energy level, speech rate

**Usage:**
```typescript
import { detectEmotion } from '@/lib/voice/emotion/emotion-detector';

const emotion = detectEmotion(characteristics);
console.log(emotion.emotion); // 'happy'
console.log(emotion.confidence); // 0.85
console.log(emotion.intensity); // 0.65
```

#### 3. Text-To-Speech (TTS)
**File:** `src/lib/tts/huggingface-tts.ts`

Converts text to speech with emotional expression:
- **Models**: 
  - Bark (emotional TTS)
  - MMS (multilingual support)
- **Languages**: 11+ languages supported
- **Emotions**: Neutral, happy, sad, angry, calm
- **Features**: Speed and pitch adjustment

**Usage:**
```typescript
import { synthesizeText } from '@/lib/tts/huggingface-tts';

const result = await synthesizeText('Hello world!', {
  language: 'en',
  emotion: 'happy',
  speed: 1.0,
  pitch: 1.1,
});

console.log(result.audio); // Buffer
console.log(result.duration); // seconds
console.log(result.sampleRate); // 22050
```

#### 4. Speech-To-Text (STT)
**File:** `src/lib/stt/huggingface-stt.ts`

Transcribes audio to text with advanced features:
- **Model**: OpenAI Whisper (base model for free)
- **Languages**: 11+ languages with auto-detection
- **Features**:
  - Punctuation restoration
  - Language detection
  - Paragraph grouping
  - Confidence scoring

**Usage:**
```typescript
import { transcribeAudio } from '@/lib/stt/huggingface-stt';

const result = await transcribeAudio(audioBuffer, {
  language: 'en',
  punctuation: true,
  paragraphs: true,
});

console.log(result.text);
console.log(result.language);
console.log(result.confidence);
```

#### 5. Voice Profiles
**File:** `src/lib/voice/voice-profile.ts`

User voice profile management and customization:
- **Profile Storage**: Averaged voice characteristics
- **Presets**: Professional, casual, storytelling, calm profiles
- **Emotion Templates**: Emotional voice profiles
- **Agent Compatibility**: Scores for different AI agents

**Usage:**
```typescript
import { VoiceProfileManager } from '@/lib/voice/voice-profile';

const profile = VoiceProfileManager.createProfile(userId, characteristics, emotion, {
  name: 'My Voice',
  isDefault: true,
});

const templates = VoiceProfileManager.getPresetTemplates();
```

#### 6. Image Generation
**File:** `src/lib/image/huggingface-image.ts`

Generates images from text prompts:
- **Models**:
  - FLUX.1-schnell (fast, high-quality)
  - Stable Diffusion v2.1
- **Features**:
  - Batch generation
  - Custom dimensions (256-1024px)
  - Guidance scale adjustment
  - Seed support for reproducibility

**Usage:**
```typescript
import { generateImage } from '@/lib/image/huggingface-image';

const result = await generateImage({
  prompt: 'A beautiful sunset over mountains',
  width: 512,
  height: 512,
  model: 'flux',
});

console.log(result.image); // Buffer
console.log(result.generationTime); // ms
```

#### 7. Image Enhancement
**File:** `src/lib/image/huggingface-image.ts`

Enhances and upscales images:
- **Upscaling**: 2x or 4x resolution increase
- **Model**: Real-ESRGAN
- **Quality**: Significant quality improvement

**Usage:**
```typescript
import { upscaleImage } from '@/lib/image/huggingface-image';

const result = await upscaleImage(imageBuffer, {
  scale: 4,
  tiling: true,
});
```

#### 8. Agent Voice Integration
**File:** `src/lib/voice/agent-voice-integration.ts`

Enables AI agents to use personalized voices:
- **Voice Assignment**: Agents can have custom voice profiles
- **Multi-Agent Coordination**: Different voice variations for different agents
- **Emotion Mapping**: Agent emotions mapped to voice emotions
- **Interaction Logging**: Track all voice interactions

**Usage:**
```typescript
import { AgentVoiceManager } from '@/lib/voice/agent-voice-integration';

const config = AgentVoiceManager.createAgentVoiceConfig(agentId, 'MyAgent');
const response = await AgentVoiceManager.generateVoiceResponse(
  agentId,
  'Hello, how can I help?',
  config,
  emotionProfile
);
```

## API Endpoints

### Voice APIs

#### POST `/api/voice/transcribe`
Transcribe audio to text with analysis.

**Request:**
```bash
curl -X POST http://localhost:3000/api/voice/transcribe \
  -F "audio=@recording.wav" \
  -F "userId=user123" \
  -F "language=en"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "text": "Hello world",
    "language": "en",
    "confidence": 0.95,
    "emotion": {
      "detected": "neutral",
      "confidence": 0.8
    },
    "characteristics": {
      "pitch": 120,
      "energy": -20,
      "spectralCentroid": 2000
    }
  }
}
```

#### POST `/api/voice/synthesize`
Generate speech from text.

**Request:**
```bash
curl -X POST http://localhost:3000/api/voice/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "language": "en",
    "emotion": "happy",
    "speed": 1.0,
    "pitch": 1.1
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "audio": "base64encodedaudiodata...",
    "mimeType": "audio/wav",
    "duration": 2.5,
    "sampleRate": 22050
  }
}
```

#### POST `/api/voice/profile`
Create/update voice profile.

**Request:**
```bash
curl -X POST http://localhost:3000/api/voice/profile \
  -F "audio=@voice.wav" \
  -F "userId=user123" \
  -F "profileName=My Voice" \
  -F "isDefault=true"
```

### Image APIs

#### POST `/api/image/generate`
Generate image from prompt.

**Request:**
```bash
curl -X POST http://localhost:3000/api/image/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful sunset",
    "width": 512,
    "height": 512,
    "model": "flux"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "image": "base64encodedimagdata...",
    "width": 512,
    "height": 512,
    "generationTime": 3500
  }
}
```

#### POST `/api/image/upscale`
Upscale image quality.

**Request:**
```bash
curl -X POST http://localhost:3000/api/image/upscale \
  -F "image=@image.png" \
  -F "scale=4"
```

### Agent APIs

#### POST `/api/agent/voice-response`
Generate agent voice response.

**Request:**
```bash
curl -X POST http://localhost:3000/api/agent/voice-response \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent123",
    "responseText": "How can I assist you?",
    "emotion": "happy",
    "language": "en"
  }'
```

## Database Schema

### VoiceProfile
Stores user voice profiles with characteristics and preferences.

### VoiceRecording
Stores audio recordings with transcriptions and emotion analysis.

### AgentVoiceConfig
Configuration for agent voices and preferences.

### VoiceInteraction
Logs all voice interactions between users and agents.

### ImageGeneration
Stores generated images with metadata.

### ImageEnhancement
Logs image upscaling operations.

### ImageBatch
Manages batch image generation jobs.

## Frontend Components

### VoiceRecorder
Records audio from microphone.

```tsx
import { VoiceRecorder } from '@/components/voice/VoiceRecorder';

<VoiceRecorder
  onRecordingComplete={(audioBuffer) => console.log(audioBuffer)}
  maxDuration={60}
/>
```

### VoicePlayer
Plays audio with controls.

```tsx
import { VoicePlayer } from '@/components/voice/VoicePlayer';

<VoicePlayer
  audioData={base64AudioData}
  duration={5.2}
  emotion="happy"
/>
```

### ImageGenerator
Generates images from prompts.

```tsx
import { ImageGenerator } from '@/components/image/ImageGenerator';

<ImageGenerator
  onGenerateComplete={(imageData) => console.log(imageData)}
  agentId="agent123"
/>
```

## Environment Variables

```env
HUGGINGFACE_API_KEY=your_hf_api_key
DATABASE_URL=your_database_url
```

## Performance Metrics

- **TTS Generation**: 1-10 seconds (depending on text length)
- **STT Processing**: 2-15 seconds (depending on audio duration)
- **Image Generation (FLUX)**: 3-5 seconds
- **Image Upscaling**: 10-30 seconds
- **Voice Analysis**: < 1 second
- **Emotion Detection**: < 500ms

## Error Handling

All components include comprehensive error handling:

```typescript
try {
  const result = await synthesizeText(text);
} catch (error) {
  console.error('TTS Error:', error);
  // Handle error appropriately
}
```

## Rate Limiting

Implement rate limiting for API endpoints:
- Transcription: 30 requests/hour per user
- Synthesis: 60 requests/hour per user
- Image Generation: 10 requests/hour per user
- Upscaling: 20 requests/hour per user

## Best Practices

1. **Voice Privacy**: Store voice data securely and with user consent
2. **Audio Quality**: Recommend 16-bit, 16kHz mono for best results
3. **Text Length**: Keep TTS text under 5000 characters
4. **Batch Processing**: Use batch APIs for multiple operations
5. **Caching**: Cache generated audio and images when possible
6. **Error Recovery**: Implement retry logic with exponential backoff

## Testing

Example tests (Jest):

```typescript
describe('Voice System', () => {
  it('should transcribe audio', async () => {
    const audioBuffer = Buffer.from([...]);
    const result = await transcribeAudio(audioBuffer);
    expect(result.text).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should detect emotion', async () => {
    const characteristics = await analyzeVoiceCharacteristics(audioBuffer, 16000);
    const emotion = detectEmotion(characteristics);
    expect(['neutral', 'happy', 'sad', 'angry']).toContain(emotion.emotion);
  });
});
```

## Future Enhancements

- Voice cloning from user recordings
- Real-time streaming transcription
- Multi-speaker identification
- Language-specific models
- Custom model fine-tuning
- Voice activity detection
- Background noise removal

## Support

For issues or questions:
1. Check the error message for details
2. Review environment variables
3. Verify Hugging Face API key is valid
4. Check rate limiting status
5. Review logs for debug information
