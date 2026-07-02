import os
import re

hooks = ["useState", "useEffect", "useContext", "useReducer", "useCallback", "useMemo", "useRef", "useLayoutEffect"]
hook_pattern = re.compile(r"\b(" + "|".join(hooks) + r")\b")

missing_files = []

for root, dirs, files in os.walk("src"):
    if any(d in root for d in ["node_modules", ".next", ".git", "lib/"]): continue
    for file in files:
        if file.endswith((".ts", ".tsx")):
            path = os.path.join(root, file)
            with open(path, "r", errors="ignore") as f:
                content = f.read()
                if hook_pattern.search(content):
                    if not re.search(r"['\"]use client['\"]", content):
                        missing_files.append(path)

for f in missing_files:
    print(f)
