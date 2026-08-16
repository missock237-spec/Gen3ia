# Tests de charge k6 — Gen3ia

Ce dossier contient les tests de charge pour les endpoints critiques de Gen3ia.

## Prérequis
- [k6](https://k6.io/docs/get-started/installation/) installé localement
- L'application Gen3ia en cours d'exécution (locale ou déployée)

## Scripts disponibles

### 1. Agents Run — Point critique
```bash
k6 run k6-load-tests/agents-run.test.js
```
Simule 50 utilisateurs concurrents exécutant des agents IA.

### 2. Webhooks — Validation HMAC
```bash
k6 run k6-load-tests/webhooks.test.js
```
Simule 100 requêtes webhook par seconde avec validation HMAC.

### 3. Crédits — Consommation simultanée
```bash
k6 run k6-load-tests/credits.test.js
```
Simule un pic de 200 utilisateurs rechargeant leurs crédits.

### 4. BullMQ Workers — File d'attente
```bash
k6 run k6-load-tests/bullmq-workers.test.js
```
Simule l'envoi de tâches BullMQ avec monitoring.

### 5. Tous les tests
```bash
k6 run k6-load-tests/smoke-test.js
```
Test de fumée combiné pour valider l'infrastructure.

## Métriques surveillées

| Métrique | Seuil critique | Seuil warning |
|----------|---------------|---------------|
| Taux d'erreur | > 5% | > 1% |
| P95 latence | > 5000ms | > 2000ms |
| P99 latence | > 10000ms | > 5000ms |
| Requêtes/sec | < 10 | < 50 |
| Échecs HMAC | > 0 | — |

## CI/CD

Les tests de charge sont intégrés au workflow GitHub Actions `ci.yml` et s'exécutent automatiquement sur chaque push vers `main`.

## Interprétation des résultats

- **http_req_duration** : temps de réponse moyen
- **http_req_failed** : taux d'échec
- **iterations** : nombre total de boucles exécutées
- **vus_max** : nombre maximum d'utilisateurs virtuels simultanés
