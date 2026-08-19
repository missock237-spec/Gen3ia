# Guide de demarrage rapide — Gen3ia AI API

Genova est une plateforme SaaS d'agents IA autonomes, concue pour l'Afrique.
Paiements Mobile Money, generation d'images/videos/audio.

## Obtenir une cle API

1. Creez un compte sur https://gen3ia.app
2. Allez dans Parametres > Cles API
3. Cliquez sur "Generer une cle"
4. Copiez la cle et stockez-la dans votre fichier .env

```env
GENOVA_API_KEY=gen_votre_cle_api
GEN3IA_API_URL=https://gen3ia.app/api
```

## Utiliser le SDK

### Installation

```bash
npm install gen3ia-sdk
# ou
yarn add gen3ia-sdk
```

### Initialisation

```typescript
import { Gen3iaClient } from "gen3ia-sdk";

const gen3ia = new Gen3iaClient({
  apiKey: process.env.GENOVA_API_KEY,
});
```

## Exemples par cas d'usage

### 1. Creer et executer un agent

```typescript
const agent = await gen3ia.createAgent({
  name: "Mon Assistant",
  type: "assistant",
  systemPrompt: "Tu es un assistant serviable.",
});
const result = await gen3ia.executeAgent(agent.id, "Ecris un poeme sur le Cameroun");
console.log(result.output);
```

### 2. Generer une image

```typescript
const image = await gen3ia.generateImage({ prompt: "Coucher de soleil sur Kribi", model: "flux-dev", width: 1024, height: 1024 });
console.log(image.imageUrl);
```

### 4. Generer une video

```typescript
const video = await gen3ia.generateVideo({ prompt: "Un lion dans la savane", model: "ltx-video", numFrames: 25 });
```

### 5. Generer du son (TTS)

```typescript
const audio = await gen3ia.generateAudio({ text: "Bienvenue sur Gen3ia AI", model: "mms-fra" });
```

### 6. S'abonner via Mobile Money

```typescript
const payment = await gen3ia.subscribe({ planId: "pro", phone: "+237691234567", operator: "mtn" });
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
  const event = request.headers.get("x-gen3ia-event");
  const payload = await request.json();
  console.log(`Evenement: ${event}`, payload);
  return NextResponse.json({ received: true });
}
```

## Support

- Email : support@gen3ia.ai
- GitHub : https://github.com/missock237-spec/Genova