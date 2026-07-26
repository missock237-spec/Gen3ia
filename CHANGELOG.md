# Changelog

## [0.5.1] - 2026-07-26
### 🐛 Audit Round 3 — Sécurité & Dépendances

#### 🔴 Critiques
| # | Fichier | Problème | Fix |
|---|---------|----------|-----|
| 1 | `next.config.ts` | `hostname: '**'` autorise TOUS les domaines d'images | Remplacé par 8 domaines explicites |
| 2 | `package.json` | `stripe` manquant alors que `stripe-client.ts` l'importe (build cassé) | Ajout `stripe: ^17.6.0` |
| 3 | `package.json` | Script `test:coverage` absent malgré `vitest.config.ts` | Ajouté avec `@vitest/coverage-v8` |

#### 🟡 Mineurs
| # | Fichier | Problème | Fix |
|---|---------|----------|-----|
| 4 | `stripe-client.ts` | Indentation erronée dans `handleInvoicePaymentFailed` | Corrigée |
| 5 | `next.config.ts` | `images.unoptimized` activé en dev seulement | Ajout domaines HF, Google, GitHub |

## [0.5.0] - 2026-07-26
### 🚀 Multi-Tenant, Agent Répl.IT, Playground API, Plugin Store

## [0.4.0] - 2026-07-26
### 📊 Dashboard temps réel, Templates vocaux, Webhook engine, Coverage 80%

## [0.3.0] - 2026-07-26
### 📡 SSE events, TTS multi-provider, API Keys, Upload, Tests E2E

## [0.2.0] - 2026-07-26
### 🖥️ WebGPU Compute, AI Router adaptatif, HuggingFace gratuit, CI/CD

## [0.1.0] - 2026-05-29
### 🚀 Première version