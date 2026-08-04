# Guide de demarrage rapide — Genova AI API

Genova est une plateforme SaaS d'agents IA autonomes, concue pour l'Afrique.
Paiements Mobile Money, generation d'images/videos/audio.

## Obtenir une cle API

1. Creez un compte sur https://genova.app
2. Allez dans Parametres > Cles API
3. Cliquez sur "Generer une cle"
4. Copiez la cle et stockez-la dans votre fichier .env

```env
GENOVA_API_KEY=gen_votre_cle_api
GENOVA_API_URL=https://genova.app/api
```

## Utiliser le SDK

### Installation

```bash
npm install genova-sdk
# ou
yarn add genova-sdk
```

### Initialisation

```typescript
import { GenovaClient } from "genova-sdk";

const genova = new GenovaClient({
  apiKey: process.env.GENOVA_API_KEY,
});
```

## Exemples par cas d'usage

### 1. Creer et executer un agent

```typescript
const agent = await genova.createAgent({
  name: "Mon Assistant",
  type: "assistant",
  systemPrompt: "Tu es un assistant serviable.",
});
const result = await genova.executeAgent(agent.id, "Ecris un poeme sur le Cameroun");
console.log(result.output);
```

### 2. Generer une image

```typescript
const image = await genova.generateImage({ prompt: "Coucher de soleil sur Kribi", model: "flux-dev", width: 1024, height: 1024 });
console.log(image.imageUrl);
```

### 4. Generer une video

```typescript
const video = await genova.generateVideo({ prompt: "Un lion dans la savane", model: "ltx-video", numFrames: 25 });
```

### 5. Generer du son (TTS)

```typescript
const audio = await genova.generateAudio({ text: "Bienvenue sur Genova AI", model: "mms-fra" });
```

### 6. S'abonner via Mobile Money

```typescript
const payment = await genova.subscribe({ planId: "pro", phone: "+237691234567", operator: "mtn" });
```

## Webhooks

| Evenement | Description |
|-----------|-------------|
| item.published | Un item publie sur le marketplace |
| item.installed | Un item installe |
| payment.completed | Paiement confirme |

```typescript
// Exemple de recepteur (Next.js)
export async function POST(request: NextRequest) {
  const event = request.headers.get("x-genova-event");
  const payload = await request.json();
  console.log(`Evenement: ${event}`, payload);
  return NextResponse.json({ received: true });
}
```

## Support

- Email : support@genova.ai
- GitHub : https://github.com/missock237-spec/Genova