import os
import re

hooks = ["useState", "useEffect", "useContext", "useReducer", "useCallback", "useMemo", "useRef", "useLayoutEffect"]
pattern = "|".join(hooks)

files_missing_client = []

for root, dirs, files in os.walk("src"):
    if "node_modules" in dirs:
        dirs.remove("node_modules")
    for file in files:
        if file.endswith((".ts", ".tsx")):
            path = os.path.join(root, file)
            with open(path, "r", errors="ignore") as f:
                content = f.read()
                if re.search(pattern, content):
                    if not re.search(r"['\"]use client['\"]", content):
                        files_missing_client.append(path)

for f in files_missing_client:
    print(f)
