# Guide d'Entraînement des Agents GENOVA

Ce guide explique comment les agents IA de Genova apprennent et comment leur raisonnement est structuré à partir des jeux de données d'entraînement.

## 🧠 Le Cœur du Raisonnement (Observe -> Analyze -> Act)

Tous les agents Genova suivent un cycle de pensée rigoureux inspiré des meilleures pratiques de résolution de problèmes complexes.

1.  **OBSERVE** : L'agent commence par collecter toutes les informations disponibles (historique, fichiers, contexte utilisateur, retours d'outils).
2.  **ANALYZE** : L'agent décompose l'objectif en étapes logiques, identifie les points de blocage potentiels et définit une stratégie.
3.  **ACT** : L'agent exécute l'action la plus pertinente (appel d'outil ou réponse finale).
4.  **REFLECT** : L'agent évalue la qualité du résultat obtenu et décide s'il doit continuer, s'adapter ou recommencer.

## 📚 Base de Connaissance Globale

L'OS Genova est pré-entraîné avec un dataset de raisonnement multimodal (`train_multimodal_reasoning.jsonl`). Ces patterns permettent aux agents de :
- Comprendre les intentions prioritaires (support, bug, lead gen, etc.).
- Suivre des étapes d'analyse éprouvées.
- Anticiper les données manquantes.

## 💾 Mémoire Par Agent

Chaque agent possède sa propre mémoire isolée qui évolue avec chaque interaction :
- **Préférences** : Apprend ce que l'utilisateur aime ou n'aime pas.
- **Épisodique** : Se souvient des interactions passées pour garder une continuité.
- **Procédural** : Enregistre les méthodes qui ont fonctionné pour des tâches spécifiques.
- **Sémantique** : Stocke des faits appris durant l'exécution.

## 🚀 Pipeline d'Amélioration

1.  **Interactions Réelles** : Les succès et échecs sont enregistrés.
2.  **Auto-Apprentissage** : L'agent extrait de nouvelles connaissances à la fin de chaque tâche.
3.  **Contextualisation** : Au prochain lancement, les mémoires les plus pertinentes sont injectées dans le prompt pour une personnalisation maximale.

## 🛠️ Customisation pour l'Utilisateur

L'utilisateur peut adapter son agent en :
- Ajoutant des compétences (Skills).
- Connectant des ressources via les connecteurs MCP ou API.
- Fournissant des documents de base dans la base de connaissance.
