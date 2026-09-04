# -*- coding: utf-8 -*-
"""
Refactor i18n workspace.ts (domain violations from interrupted session).

1. Add missing FR keys (voice.backgroundConversations*)
2. Split workspace.ts into domain files:
   - terminal.ts   (terminal.*)
   - files.ts      (files.*)
   - voice.ts      (voice.*)
   - input.ts      (input.*)
   - workflows.ts  (workflows.*)
3. Move tasks.* keys → tasks.ts
4. Delete workspace.ts; update dictionaries.ts
"""
import re
from pathlib import Path

DICT = Path("src/lib/i18n/dict")

# ── 1. Read workspace.ts and extract keys per domain ──
src = (DICT / "workspace.ts").read_text(encoding="utf-8")

fr_block = src.split("fr: {", 1)[1].split("\n  },", 1)[0]
en_block = src.split("en: {", 1)[1].rsplit("\n  },", 1)[0]

def extract_keys(block: str) -> dict:
    keys = {}
    # Match "key": "value" entries (single-line only)
    for m in re.finditer(r'^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$', block, re.M):
        keys[m.group(1)] = m.group(2)
    return keys

fr = extract_keys(fr_block)
en = extract_keys(en_block)

# Fix the missing FR keys first
fr["voice.backgroundConversations"] = "Conversations en arrière-plan"
fr["voice.backgroundConversationsDesc"] = "Maintient la dictée active pendant la navigation entre les pages."

print(f"fr keys: {len(fr)}, en keys: {len(en)}")
assert set(fr) == set(en), f"parity break: fr-only={set(fr)-set(en)}, en-only={set(en)-set(fr)}"

# Group by domain
domains: dict = {}
tasks_add: dict = {}
for key in fr:
    prefix = key.split(".")[0]
    if prefix == "tasks":
        tasks_add[key] = (fr[key], en[key])
    else:
        domains.setdefault(prefix, {})[key] = (fr[key], en[key])

print("domains:", {d: len(v) for d, v in domains.items()})
print("tasks additions:", list(tasks_add))

TEMPLATE = '''/** {comment} */

export const {export_name} = {{
  fr: {{
{fr_keys}
  }},

  en: {{
{en_keys}
  }},
}}
'''

DOMAIN_COMMENTS = {
    "terminal": "Terminal intégré des agents IA (lecture seule humaine) — v4.1.",
    "files": "Fichiers des agents (visualiseur de code : voir, décider, modifier) — v4.1.",
    "voice": "Mode vocal : personas, dictée, historique — v4.1 (captures).",
    "input": "Barre de saisie enrichie des chats (micro, envoi, +, modèle) — v4.1.",
    "workflows": "Bibliothèque de workflows catégorisés avec épinglage — v4.1 (captures).",
}

for domain, keys in domains.items():
    fr_lines = []
    en_lines = []
    for key in sorted(keys):
        fr_val, en_val = keys[key]
        fr_lines.append(f'    "{key}": "{fr_val}",')
        en_lines.append(f'    "{key}": "{en_val}",')
    content = TEMPLATE.format(
        comment=DOMAIN_COMMENTS[domain],
        export_name=domain,
        fr_keys="\n".join(fr_lines),
        en_keys="\n".join(en_lines),
    )
    (DICT / f"{domain}.ts").write_text(content, encoding="utf-8")
    print(f"wrote {domain}.ts ({len(keys)} keys)")

# ── 2. Move tasks.* keys into tasks.ts ──
tasks_path = DICT / "tasks.ts"
tasks_src = tasks_path.read_text(encoding="utf-8")

for key, (fr_val, en_val) in tasks_add.items():
    if f'"{key}"' in tasks_src:
        continue
    # Insert after the last key in the FR block and EN block respectively
    fr_section = tasks_src.split("fr: {", 1)[1].split("\n  },", 1)[0]
    last_fr = fr_section.rstrip().rstrip(",")
    # Find last key line
    lines = fr_section.rstrip().split("\n")
    last_line = lines[-1] if lines else None
    if last_line and last_line.strip().endswith(","):
        pass
    # Append to FR block: insert before closing
    tasks_src = tasks_src.replace("\n  },", f'\n    "{key}": "{fr_val}",\n  }},', 1)
    # For EN: append into the EN block (second occurrence)
    parts = tasks_src.split("\n  },")
    if len(parts) >= 2:
        # The EN block is after the second-to-last split marker
        # Safer: split at 'en: {' and add before its closing
        en_idx = tasks_src.find("en: {")
        if en_idx > -1:
            # find the closing "  }," after en block start
            close_idx = tasks_src.find("\n  },", en_idx)
            insertion = f'\n    "{key}": "{en_val}",'
            tasks_src = tasks_src[:close_idx] + insertion + tasks_src[close_idx:]

tasks_path.write_text(tasks_src, encoding="utf-8")
print("tasks.ts updated with", list(tasks_add))

# ── 3. Delete workspace.ts ──
(DICT / "workspace.ts").unlink()
print("workspace.ts deleted")

# ── 4. Update dictionaries.ts ──
dicts_path = Path("src/lib/i18n/dictionaries.ts")
d = dicts_path.read_text(encoding="utf-8")
d = d.replace('import { workspace } from "./dict/workspace";\n', "")
new_imports = (
    'import { terminal } from "./dict/terminal";\n'
    'import { files } from "./dict/files";\n'
    'import { voice } from "./dict/voice";\n'
    'import { input } from "./dict/input";\n'
    'import { workflows } from "./dict/workflows";\n'
)
d = d.replace('import { docs } from "./dict/docs";', 'import { docs } from "./dict/docs";\n' + new_imports, 1)
d = d.replace(
    "const DOMAINS = [common, nav, auth, landing, dashboard, live, agents, tasks, settings, billing, connectors, knowledge, memory, marketplace, skills, tools, apikeys, sdk, swarm, webhooks, batch, watchdog, traces, finetune, admin, ads, docs, workspace] as const;",
    "const DOMAINS = [common, nav, auth, landing, dashboard, live, agents, tasks, settings, billing, connectors, knowledge, memory, marketplace, skills, tools, apikeys, sdk, swarm, webhooks, batch, watchdog, traces, finetune, admin, ads, docs, terminal, files, voice, input, workflows] as const;",
)
dicts_path.write_text(d, encoding="utf-8")
print("dictionaries.ts updated")

# ── 5. Update i18n-domains test expected list ──
test_path = Path("tests/unit/i18n-domains.test.ts")
t = test_path.read_text(encoding="utf-8")
t = t.replace(
    '"settings", "landing", "common", "docs",',
    '"settings", "landing", "common", "docs", "terminal", "files", "voice", "input", "workflows",',
)
test_path.write_text(t, encoding="utf-8")
print("i18n-domains test updated")

print("\nDONE")
