# -*- coding: utf-8 -*-
"""Tasks page: ChatComposer integration + search (v4.1)."""
import re

path = "src/app/(app)/tasks/page.tsx"
with open(path, encoding="utf-8") as f:
    c = f.read()

# 1. State: remove prompt state, add search state
c2 = re.sub(
    r'  const \[prompt, setPrompt\] = useState\(""\);?\n  const \[agentId, setAgentId\] = useState\(""\)\n  const \[creating, setCreating\] = useState\(false\)\n',
    '  const [agentId, setAgentId] = useState("")\n  const [creating, setCreating] = useState(false)\n  const [search, setSearch] = useState("")\n',
    c,
    count=1,
)
assert c2 != c, "state pattern"
c = c2

# 2. Filter + createTask signature
old = '  const agents = (agentsData?.agents ?? []).filter((a) => a.status !== "ARCHIVED")\n\n  async function createTask() {\n    if (prompt.trim().length < 10) {'
new = (
    '  const agents = (agentsData?.agents ?? []).filter((a) => a.status !== "ARCHIVED")\n'
    '  // v4.1 (captures) — recherche de projets/tâches.\n'
    '  const filtered = search.trim()\n'
    '    ? tasks.filter((task) => task.prompt.toLowerCase().includes(search.trim().toLowerCase()))\n'
    '    : tasks\n\n'
    '  async function createTask(payload: ChatComposerSubmit) {\n'
    '    const prompt = payload.text\n'
    '    if (prompt.trim().length < 10) {'
)
assert old in c, "filter+fn"
c = c.replace(old, new, 1)

# 3. API call
old = '''        prompt: prompt.trim(),
        agentId: agentId || null,
      })'''
new = '''        prompt: prompt.trim(),
        agentId: agentId || null,
        preferredModel: payload.model,
        attachmentIds: payload.attachments.map((a) => a.id),
      })'''
assert old in c, "api call"
c = c.replace(old, new, 1)

# 4. Remove setPrompt reset
c2 = re.sub(r'\n      setPrompt\(""\)', "", c, count=1)
assert c2 != c, "setPrompt"
c = c2

with open(path, "w", encoding="utf-8") as f:
    f.write(c)
print("state/fn OK")
