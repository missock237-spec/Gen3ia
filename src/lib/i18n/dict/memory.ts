/** Mémoire — cinq couches (court/long terme, tâche, utilisateur, agent), écriture et liste. */

export const memory = {
  fr: {
    "memory.title": "Mémoire ({count})",
    "memory.subtitle": "Cinq couches de mémoire. Les leçons et préférences sont rappelées automatiquement pendant l'analyse et l'exécution.",

    "memory.write.title": "Écrire une mémoire",
    "memory.write.layer": "Couche",
    "memory.write.content": "Contenu",
    "memory.write.placeholder": "Ex. Toujours répondre en français, format concis.",

    "memory.item.meta": "importance {importance} · {date}",

    "memory.empty": "Aucune mémoire. Lancez des tâches : les leçons s'accumulent automatiquement.",

    "memory.errors.write": "Écriture impossible",
    "memory.errors.delete": "Suppression impossible",

    "memory.saved.title": "Mémoire enregistrée",
    "memory.saved.desc": "Elle sera rappelée selon sa pertinence.",

    "memory.layers.SHORT_TERM.label": "Court terme",
    "memory.layers.SHORT_TERM.desc": "Contexte immédiat (expiration automatique)",
    "memory.layers.LONG_TERM.label": "Long terme",
    "memory.layers.LONG_TERM.desc": "Leçons durables tirées des tâches",
    "memory.layers.TASK.label": "Tâche",
    "memory.layers.TASK.desc": "Contexte propre à une tâche en cours",
    "memory.layers.USER.label": "Utilisateur",
    "memory.layers.USER.desc": "Vos préférences et votre profil",
    "memory.layers.AGENT.label": "Agent",
    "memory.layers.AGENT.desc": "Connaissances propres à un agent",
  },
  en: {
    "memory.title": "Memory ({count})",
    "memory.subtitle": "Five memory layers. Lessons and preferences are recalled automatically during analysis and execution.",

    "memory.write.title": "Write a memory",
    "memory.write.layer": "Layer",
    "memory.write.content": "Content",
    "memory.write.placeholder": "E.g. Always answer in French, concise format.",

    "memory.item.meta": "importance {importance} · {date}",

    "memory.empty": "No memories yet. Run tasks: lessons accumulate automatically.",

    "memory.errors.write": "Could not write",
    "memory.errors.delete": "Could not delete",

    "memory.saved.title": "Memory saved",
    "memory.saved.desc": "It will be recalled based on its relevance.",

    "memory.layers.SHORT_TERM.label": "Short term",
    "memory.layers.SHORT_TERM.desc": "Immediate context (automatic expiration)",
    "memory.layers.LONG_TERM.label": "Long term",
    "memory.layers.LONG_TERM.desc": "Durable lessons learned from tasks",
    "memory.layers.TASK.label": "Task",
    "memory.layers.TASK.desc": "Context specific to a running task",
    "memory.layers.USER.label": "User",
    "memory.layers.USER.desc": "Your preferences and profile",
    "memory.layers.AGENT.label": "Agent",
    "memory.layers.AGENT.desc": "Knowledge specific to an agent",
  },
};
