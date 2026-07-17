# Politique de sécurité — Genova

## Versions supportées

| Version | Support sécurité |
|---------|------------------|
| main (latest) | ✅ Oui |
| < 0.2.0 | ❌ Non |

## Signaler une vulnérabilité

**Ne pas créer d'issue publique pour les vulnérabilités de sécurité.**

Envoie un email à : **security@genova.ia** (ou ouvre une issue privée via GitHub Security Advisories).

Inclus :
1. Description de la vulnérabilité
2. Étapes pour reproduire
3. Impact potentiel
4. Suggestions de correction (optionnel)

Nous t'accuserons réception sous **48h** et fournirons un patch sous **7 jours** pour les vulnérabilités critiques.

## Bonnes pratiques de sécurité du projet

- Authentification : PBKDF2 avec sel unique par utilisateur (100 000 itérations, SHA-512)
- Tokens : PBKDF2-hashés avant stockage en base
- Sessions : cookies HttpOnly + SameSite=Strict
- Rate limiting : Redis en production, mémoire en développement
- CORS : origines configurables via `CORS_ALLOWED_ORIGINS`
- Audit log : toutes les actions sensibles sont tracées en base
- Variables d'environnement : jamais de secrets dans le code source

## Dépendances

Nous effectuons un audit des dépendances régulièrement :
```bash
bun audit
```