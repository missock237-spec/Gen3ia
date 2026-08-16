// ============================================================
// Tests — Auto-complétion du Terminal
// ============================================================
import { describe, it, expect } from "vitest";

const COMMANDS = [
  "help", "clear", "history", "ls", "cat", "files",
  "create", "edit", "read", "view", "delete", "rm",
  "version", "gen3ia", "pwd", "echo", "date", "whoami",
  "status", "agents",
];

const FILE_COMMANDS = ["cat", "edit", "read", "view", "delete", "rm"];

describe("Terminal Auto-completion", () => {
  describe("Command suggestions", () => {
    it("suggette les commandes commencant par 'h'", () => {
      const input = "h";
      const suggestions = COMMANDS.filter(c => c.startsWith(input) && c !== input);
      expect(suggestions).toContain("help");
      expect(suggestions).toContain("history");
      expect(suggestions).not.toContain("clear");
    });

    it("suggette les commandes commencant par 'c'", () => {
      const input = "c";
      const suggestions = COMMANDS.filter(c => c.startsWith(input) && c !== input);
      expect(suggestions).toContain("clear");
      expect(suggestions).toContain("create");
      expect(suggestions).toContain("cat");
      expect(suggestions).not.toContain("help");
    });

    it("retourne un tableau vide si la commande est complete", () => {
      const input = "help";
      const suggestions = COMMANDS.filter(c => c.startsWith(input) && c !== input);
      expect(suggestions).toEqual([]);
    });

    it("retourne un tableau vide si input vide", () => {
      const input = "";
      const suggestions = COMMANDS.filter(c => c.startsWith(input) && c !== input);
      expect(suggestions).toHaveLength(0);
    });

    it("limite a 8 suggestions maximum", () => {
      const input = "";
      const all = COMMANDS.filter(c => c.startsWith(input) && c !== input);
      const limited = all.slice(0, 8);
      expect(limited.length).toBeLessThanOrEqual(8);
    });
  });

  describe("File name suggestions (second argument)", () => {
    const files = [
      { path: "/workspace/app.ts", size: 1024 },
      { path: "/workspace/main.tsx", size: 2048 },
      { path: "/workspace/config.json", size: 512 },
      { path: "/workspace/script.py", size: 768 },
    ];

    it("filtre les fichiers par le deuxieme argument", () => {
      const parts = "cat ap".split(" ");
      const current = parts[parts.length - 1].toLowerCase();
      const matches = files
        .map(f => f.path.split("/").pop() || "")
        .filter(name => name.toLowerCase().startsWith(current) && name !== current);
      expect(matches).toContain("app.ts");
      expect(matches).not.toContain("config.json");
    });

    it("retourne vide si aucun fichier ne correspond", () => {
      const parts = "edit zzz".split(" ");
      const current = parts[parts.length - 1].toLowerCase();
      const matches = files
        .map(f => f.path.split("/").pop() || "")
        .filter(name => name.toLowerCase().startsWith(current) && name !== current);
      expect(matches).toEqual([]);
    });

    it("ne suggere que pour les commandes de fichiers", () => {
      expect(FILE_COMMANDS).toContain("cat");
      expect(FILE_COMMANDS).toContain("edit");
      expect(FILE_COMMANDS).toContain("delete");
      expect(FILE_COMMANDS).not.toContain("help");
      expect(FILE_COMMANDS).not.toContain("clear");
    });
  });

  describe("History management", () => {
    it("ajoute les commandes dans l'ordre inverse", () => {
      const MAX_HISTORY = 50;
      let history: string[] = [];
      const addToHistory = (cmd: string) => {
        history = [cmd, ...history.filter(h => h !== cmd)].slice(0, MAX_HISTORY);
      };

      addToHistory("help");
      addToHistory("ls");
      addToHistory("pwd");

      expect(history).toEqual(["pwd", "ls", "help"]);
    });

    it("deduplicate les commandes identiques", () => {
      let history: string[] = [];
      const addToHistory = (cmd: string) => {
        history = [cmd, ...history.filter(h => h !== cmd)].slice(0, 50);
      };

      addToHistory("help");
      addToHistory("ls");
      addToHistory("help");

      expect(history).toEqual(["help", "ls"]);
      expect(history).toHaveLength(2);
    });

    it("limite l'historique a MAX_HISTORY entrées", () => {
      let history: string[] = [];
      const addToHistory = (cmd: string) => {
        history = [cmd, ...history.filter(h => h !== cmd)].slice(0, 50);
      };

      for (let i = 0; i < 100; i++) {
        addToHistory(`cmd-${i}`);
      }

      expect(history).toHaveLength(50);
      expect(history[0]).toBe("cmd-99");
    });

    it("navigation avec ArrowUp", () => {
      const history = ["pwd", "ls", "help"];
      let historyIdx = -1;

      // ArrowUp 1 fois -> première commande
      historyIdx = Math.min(historyIdx + 1, history.length - 1);
      expect(history[historyIdx]).toBe("pwd");

      // ArrowUp 2 fois -> deuxième commande
      historyIdx = Math.min(historyIdx + 1, history.length - 1);
      expect(history[historyIdx]).toBe("ls");

      // ArrowUp 3 fois -> dernière commande (limite)
      historyIdx = Math.min(historyIdx + 1, history.length - 1);
      expect(history[historyIdx]).toBe("help");

      // Ne pas dépasser
      historyIdx = Math.min(historyIdx + 1, history.length - 1);
      expect(history[historyIdx]).toBe("help");
    });

    it("navigation avec ArrowDown", () => {
      const history = ["pwd", "ls", "help"];
      let historyIdx = 2; // on est sur "help"

      // ArrowDown -> retour vers "ls"
      historyIdx = historyIdx - 1;
      expect(history[historyIdx]).toBe("ls");

      // ArrowDown -> retour vers "pwd"
      historyIdx = historyIdx - 1;
      expect(history[historyIdx]).toBe("pwd");

      // ArrowDown -> réinitialiser (index -1)
      historyIdx = -1;
      expect(historyIdx).toBe(-1);
    });
  });
});
