# -*- coding: utf-8 -*-
"""Tasks page: replace Textarea with ChatComposer, add search bar, use filtered list."""
import re

path = "src/app/(app)/tasks/page.tsx"
with open(path, encoding="utf-8") as f:
    c = f.read()

# 1. Replace the Textarea + launch button block with ChatComposer
c2 = re.sub(
    r'          <Textarea\n            value=\{prompt\}\n            onChange=\{\(e\) => setPrompt\(e\.target\.value\)\}\n            placeholder=\{t\("tasks\.promptPlaceholder"\)\}\n            className="min-h-\[100px\] bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"\n          />',
    '''          {/* v4.1 — barre de saisie enrichie : micro vocal, envoi, + (connecteurs/fichiers tous types), modèle */}
          <ChatComposer
            onSend={createTask}
            sending={creating}
            sendLabel={t("tasks.launch")}
            placeholder={t("tasks.promptPlaceholder")}
            minLength={10}
            rows={3}
          />''',
    c,
    count=1,
)
assert c2 != c, "textarea"
c = c2

# 2. Remove the launch Button block (its flex container now only has the agent select)
c2 = re.sub(
    r'            <div className="flex items-end">\n(?:.*\n)*?            </div>\n',
    "",
    c,
    count=1,
)
assert c2 != c, "button block"
c = c2

# 3. Search bar in list header + filtered list + empty state
old = '''        <CardHeader>
          <CardTitle className="text-base">{t("tasks.listTitle", { count: tasks.length })}</CardTitle>
        </CardHeader>'''
new = '''        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">{t("tasks.listTitle", { count: filtered.length })}</CardTitle>
            {/* v4.1 (captures) — recherche des tâches */}
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("tasks.searchPlaceholder")}
                className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
              />
            </div>
          </div>
        </CardHeader>'''
assert old in c, "header"
c = c.replace(old, new, 1)

# 4. filtered.length empty state + filtered.map
c2 = c.replace('tasks.length === 0 ? (', 'filtered.length === 0 ? (', 1)
assert c2 != c, "empty count"
c = c2

old_empty = '<p className="text-sm">{t("tasks.empty")}</p>'
new_empty = '<p className="text-sm">{search.trim() ? t("tasks.searchEmpty", { query: search.trim() }) : t("tasks.empty")}</p>'
assert old_empty in c, "empty text"
c = c.replace(old_empty, new_empty, 1)

c2 = c.replace('{tasks.map((task) => (', '{filtered.map((task) => (', 1)
assert c2 != c, "map"
c = c2

with open(path, "w", encoding="utf-8") as f:
    f.write(c)
print("composer+search OK")
