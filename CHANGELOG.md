# Changelog

## [0.9.0] — 2026-07-28 — Session Monorepo & Terminal v2

### 🚀 Nouvelles fonctionnalités
- **Terminal v2.1** : Exécution bash réelle, auto-complétion TAB, historique ↑/↓, sudo protégé (#96, #99, #100, #101)
- **Éditeur de fichiers inline** : edit, read, delete dans le terminal (#100)
- **WebSocket hook** : `useTerminalWS` avec reconnexion automatique (#101)
- **Mode PWA** : Service Worker v2 offline-first, cache partitionné (#104)
- **Docker** : Dockerfile multi-stage, docker-compose avec postgres/redis/traefik (#102)
- **CI/CD Release** : Pipeline tests + coverage 80% + auto-tag GitHub Release (#107)
- **Monorepo** : Structure `packages/`, `apps/`, `tsconfig.base.json` (#105)

### 📝 Documentation
- README complet avec badges, terminal docs, Docker (#102)
- ARCHITECTURE.md, SECURITY.md, CONTRIBUTING.md, CHANGELOG.md

### 🧪 Tests
- 46 tests (auth, agent, rate-limit, terminal, ReAct loop, crédits, autocomplete)
- Coverage seuil 80% configuré dans vitest.config.ts (#106)
- Tests ReAct : validation, execution, mémoire, erreurs (#106)
- Tests crédits : déduction, plans, vérification (#106)

### 🏷️ Renommage
- Projet entièrement renommé **Genova → Gen3ia** (30+ fichiers, 0 références restantes)
- PRs : #93, #94, #95, #96, #97, #103, #104

### 🐛 Corrections
- Settings-view complète avec 6 onglets (#93)
- Mise à jour email.ts (noreply@gen3ia.ai, footer, sujets) (#103)
- Nettoyage des fichiers temporaires (ci.yml, deploy.yml, test-force-push...) (#105)
- Correction test setup.ts (genova_test → gen3ia_test) (#107)

## [0.8.0] — 2026-07-20

- Version initiale Gen3ia
- Agents IA avec boucle ReAct
- Authentication Google/GitHub
- Dashboard avec métriques
- Paiements Mobile Money (SebPay)
- WhatsApp integration
