/** Base de connaissances — documents, import de fichier, recherche RAG. */

export const knowledge = {
  fr: {
    "knowledge.title": "Base de connaissances",
    "knowledge.subtitle": "Vos documents alimentent le RAG : les agents et les tâches les citent avec pertinence.",

    "knowledge.add.title": "Ajouter un document",
    "knowledge.form.title": "Titre",
    "knowledge.form.titlePlaceholder": "Ex. Politique tarifaire 2026",
    "knowledge.form.text": "Texte",
    "knowledge.form.textPlaceholder": "Collez le contenu du document…",
    "knowledge.form.importFile": "Ou importer un fichier .txt / .md / .json",
    "knowledge.form.sizeKb": "{size} Ko",
    "knowledge.form.indexing": "Indexation…",
    "knowledge.form.index": "Indexer le document",
    "knowledge.form.hint": "Le texte est automatiquement découpé en morceaux indexés (recherche TF-IDF + similarité cosinus).",

    "knowledge.search.title": "Tester la recherche",
    "knowledge.search.placeholder": "Votre question…",
    "knowledge.search.empty": "Aucun résultat pertinent.",

    "knowledge.documents": "Documents ({count})",
    "knowledge.empty": "Aucun document. Ajoutez-en un pour activer le RAG.",

    "knowledge.errors.fileShort": "Fichier trop court",
    "knowledge.errors.fileShortDesc": "Le contenu doit faire au moins 20 caractères.",
    "knowledge.errors.add": "Ajout impossible",
    "knowledge.errors.incomplete": "Informations incomplètes",
    "knowledge.errors.incompleteDesc": "Titre (2+) et contenu (20+ caractères) requis.",
    "knowledge.errors.delete": "Suppression impossible",
    "knowledge.errors.search": "Recherche impossible",

    "knowledge.indexed.title": "Document indexé",
    "knowledge.indexed.fileDesc": "{file} découpé et indexé pour le RAG.",
    "knowledge.indexed.desc": "Découpé et indexé pour le RAG.",
  },
  en: {
    "knowledge.title": "Knowledge base",
    "knowledge.subtitle": "Your documents feed the RAG: agents and tasks cite them where relevant.",

    "knowledge.add.title": "Add a document",
    "knowledge.form.title": "Title",
    "knowledge.form.titlePlaceholder": "E.g. 2026 pricing policy",
    "knowledge.form.text": "Text",
    "knowledge.form.textPlaceholder": "Paste the document content…",
    "knowledge.form.importFile": "Or import a .txt / .md / .json file",
    "knowledge.form.sizeKb": "{size} KB",
    "knowledge.form.indexing": "Indexing…",
    "knowledge.form.index": "Index the document",
    "knowledge.form.hint": "The text is automatically split into indexed chunks (TF-IDF search + cosine similarity).",

    "knowledge.search.title": "Test the search",
    "knowledge.search.placeholder": "Your question…",
    "knowledge.search.empty": "No relevant results.",

    "knowledge.documents": "Documents ({count})",
    "knowledge.empty": "No documents yet. Add one to enable the RAG.",

    "knowledge.errors.fileShort": "File too short",
    "knowledge.errors.fileShortDesc": "The content must be at least 20 characters.",
    "knowledge.errors.add": "Could not add",
    "knowledge.errors.incomplete": "Incomplete information",
    "knowledge.errors.incompleteDesc": "Title (2+) and content (20+ characters) required.",
    "knowledge.errors.delete": "Could not delete",
    "knowledge.errors.search": "Search failed",

    "knowledge.indexed.title": "Document indexed",
    "knowledge.indexed.fileDesc": "{file} split and indexed for the RAG.",
    "knowledge.indexed.desc": "Split and indexed for the RAG.",
  },
};
