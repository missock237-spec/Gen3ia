# Variables d'environnement Firebase sur Vercel — Gen3ia

> **TL;DR** : Pour que Gen3ia fonctionne sur Vercel, vous devez définir **9 variables Firebase obligatoires** dans Project Settings → Environment Variables. Ce document liste exactement lesquelles, comment les obtenir, et comment les vérifier.

---

## 1. Liste complète des variables Firebase obligatoires

### Variables PUBLIQUES (exposées au navigateur — préfixe `NEXT_PUBLIC_`)

| Variable | Où la trouver | Exemple |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Console Firebase → Project Settings → General → Web App | `AIzaSyABC...xyz` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Console Firebase → Project Settings → General | `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Console Firebase → Project Settings → General | `your-project-id` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Console Firebase → Project Settings → General | `your-project-id.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Console Firebase → Project Settings → Cloud Messaging | `123456789012` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Console Firebase → Project Settings → General → Web App | `1:1234:web:abcd1234` |

### Variables SERVEUR (Firebase Admin SDK — ne JAMAIS exposer au navigateur)

Deux formats supportés. **Choisissez UN des deux** :

#### Format 1 — JSON complet (recommandé pour Vercel)

```bash
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk@..."}
```

> **Astuce** : dans Console Firebase → Project Settings → Service Accounts → "Generate new private key", vous obtenez un fichier JSON. Collez tout le contenu JSON comme valeur de `FIREBASE_SERVICE_ACCOUNT` (sur une seule ligne, sans newlines).

#### Format 2 — 3 variables séparées

```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

> Sur Vercel, le format 1 est préférable car il évite les problèmes d'échappement de `\n` dans la clé privée.

---

## 2. Variables optionnelles (recommandées mais non-bloquantes)

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | Realtime Database (si utilisé) |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Google Analytics pour Firebase |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'app (pour les emails, OAuth redirects) |

---

## 3. Configuration sur Vercel (3 méthodes)

### Méthode A — UI Web (recommandé)

1. https://vercel.com → votre projet Gen3ia
2. **Settings** → **Environment Variables**
3. Pour chaque variable :
   - **Name** : nom exact (ex. `NEXT_PUBLIC_FIREBASE_API_KEY`)
   - **Value** : la valeur
   - **Environment** : cochez **Production**, **Preview**, **Development**
4. **Save**

### Méthode B — Vercel CLI (scriptable)

```bash
# Installer Vercel CLI si nécessaire
npm i -g vercel

# Se lier au projet
cd /home/z/my-project/Gen3ia
vercel link

# Ajouter chaque variable (tous environnements)
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production preview development
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN production preview development
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID production preview development
vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET production preview development
vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID production preview development
vercel env add NEXT_PUBLIC_FIREBASE_APP_ID production preview development

# Compte de service (Format 1 recommandé)
vercel env add FIREBASE_SERVICE_ACCOUNT production preview development
```

### Méthode C — Importer depuis `.env.local` (bulk)

```bash
# Créer un fichier .env.vercel-export
vercel env pull .env.vercel-export development

# Éditer, puis réimporter
vercel env add --git-branch=main < .env.vercel-export
```

---

## 4. Vérification post-déploiement

### Vérification locale (avant push)

```bash
bash scripts/verify_firebase_env.sh --strict
```

→ exit 0 si tout est bon, exit 1 si une variable obligatoire manque.

### Vérification côté navigateur (une fois déployé)

1. Ouvrez l'URL de production sur Vercel
2. Ouvrez la console du navigateur (F12 → Console)
3. Vous devez voir :
   ```
   [gen3ia] hydrate OK
   [gen3ia] validateSession OK — session active
   ```
4. Si vous voyez `[gen3ia] hydrate error:` → le serveur n'a probablement pas accès à `FIREBASE_SERVICE_ACCOUNT`.
5. Si vous voyez une erreur Firebase "auth/invalid-api-key" → les variables `NEXT_PUBLIC_FIREBASE_*` sont mal définies sur Vercel.

### Vérification côté serveur (Vercel logs)

1. https://vercel.com → votre projet → **Logs** tab
2. Recherchez `[firebase-admin]` ou `[firebase/client]`
3. `[firebase-admin] FIREBASE_SERVICE_ACCOUNT JSON invalide` → le JSON est mal formé (problème d'échappement)
4. `[firebase-admin] credential: undefined` → ni Format 1 ni Format 2 n'est configuré

---

## 5. Compte de service — échappement correct sur Vercel

Le piège classique : la clé privée contient des `\n` littéraux. Sur Vercel, **deux options** :

### Option A — Coller le JSON brut complet

1. Récupérez le fichier JSON depuis Console Firebase (Service Account → Generate new private key)
2. **Supprimez tous les retours à la ligne** du fichier (outil `jq` ou éditeur)
3. Collez tout le JSON sur une seule ligne dans la valeur Vercel

```bash
# Convertir un fichier service-account.json en une seule ligne
jq -c . service-account.json
```

→ copiez la sortie complète comme valeur de `FIREBASE_SERVICE_ACCOUNT`.

### Option B — Variables séparées avec `\n` échappés

```bash
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqh\\n...\\n-----END PRIVATE KEY-----\\n"
```

> **Important** : dans le code, on appelle déjà `.replace(/\\n/g, '\n')` sur la valeur (voir `src/lib/firebase/admin.ts`). Donc sur Vercel, la valeur doit contenir des `\n` littéraux (double-backslash `\\n`).

---

## 6. Checklist finale

- [ ] 6 variables `NEXT_PUBLIC_FIREBASE_*` définies sur Vercel (Production + Preview + Development)
- [ ] `FIREBASE_SERVICE_ACCOUNT` (JSON complet) **OU** les 3 variables séparées définies
- [ ] `NEXT_PUBLIC_APP_URL` défini (ex. `https://your-domain.vercel.app`)
- [ ] `scripts/verify_firebase_env.sh` exécuté en local → exit 0
- [ ] Une fois déployé : console navigateur affiche `[gen3ia] hydrate OK`
- [ ] Une fois déployé : logs Vercel n'affichent pas d'erreur Firebase

---

## 7. Sources de la documentation Firebase

- Configuration Web App : https://firebase.google.com/docs/web/learn-setup
- Admin SDK init : https://firebase.google.com/docs/admin/setup
- Service Accounts : https://console.firebase.google.com → Project Settings → Service Accounts
