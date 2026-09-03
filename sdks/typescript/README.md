# @gen3ia/sdk (TypeScript)

SDK officiel GEN3IA — **types générés depuis le schéma Prisma** (autocomplétion
complète, zéro divergence entre base et client).

```bash
npm install @gen3ia/sdk   # ou : copier src/ directement (zéro dépendance)
```

```ts
import { Gen3iaClient } from "@gen3ia/sdk"

const client = new Gen3iaClient({ apiKey: "g3ia_live_...", baseUrl: "https://gen3ia.online" })
const task = await client.runTask("Analyse le marché des panneaux solaires", { agentSlug: "analyste-marche" })
console.log(task.result?.answer)
```

Régénération des types après modification du schéma :
```bash
node scripts/gen-sdk-types.mjs
```
