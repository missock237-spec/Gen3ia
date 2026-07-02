import os
import re

def check():
    hooks = ["useState", "useEffect", "useContext", "useReducer", "useCallback", "useMemo", "useRef", "useLayoutEffect"]
    hook_pattern = "|".join(hooks)
    radix_pattern = "@radix-ui"

    missing = []
    for root, _, files in os.walk("src"):
        if "node_modules" in root or ".next" in root: continue
        for file in files:
            if file.endswith((".ts", ".tsx")):
                path = os.path.join(root, file)
                with open(path, "r", errors="ignore") as f:
                    content = f.read()

                if (re.search(hook_pattern, content) or radix_pattern in content):
                    if '"use client"' not in content and "'use client'" not in content:
                        # Exclude lib files which might just be exporting helpers that are called by client components
                        if "src/lib" in path: continue
                        missing.append(path)
    return missing

missing_files = check()
for m in missing_files:
    print(m)
