# ADR-0003 — RAG hybride : embeddings persistés + repli lexical TF-IDF

## Statut
Accepté (v3.1 — remplace le TF-IDF full-scan de la v3.0)

## Contexte
La v3.0 recalculait le TF-IDF sur TOUT le corpus à CHAQUE requête
(O(tokens du corpus) par recherche), sans index persistant. Les embeddings
sémantiques étaient absents.

## Décision
1. **Indexation à l'ingestion** : chaque document est découpé (900 car.,
   chevauchement 120) et ses embeddings calculés UNE fois, persistés dans
   la table `Embedding` (JSON number[] + norme L2 précalculée).
2. **Recherche hybride** : cosinus sur vecteurs (0.6) + TF-IDF ciblé sur les
   candidats (0.4) — le lexical reste imbattable sur identifiants exacts
   (numéros, noms propres) que les embeddings diluent.
3. **Fournisseurs** : openai-compatible (`text-embedding-3-small`, dim 512)
   si clé présente, sinon local (hachage n-grammes 256 d, déterministe, sans
   réseau). Circuit breaker autour du fournisseur distant.
4. **Repli TF-IDF pur** pour les documents antérieurs à la v3.1
   (réindexables via POST /api/knowledge/[id]/reindex).

## Options rejetées
- **Pinecone/Qdrant/Weaviate** : service externe obligatoire (clé, réseau,
  coût) — contredit « fonctionne avec seulement une clé LLM ».
- **pgvector natif** : lie le RAG à Postgres ; la portabilité SQLite serait
  perdue. Évolution documentée si le volume dépasse ~50k vecteurs (l'interface
  `indexDocument`/`searchVector` est conservée).

## Conséquences
- Le rappel sémantique dépend du fournisseur : local ≈ lexical enrichi
  (bigrammes), openai = sémantique vraie. Le mode actif est exposé dans
  l'admin (stockage vectoriel).
- Réindexation nécessaire après changement de modèle d'embedding
  (les vecteurs sont comparés par modèle).
