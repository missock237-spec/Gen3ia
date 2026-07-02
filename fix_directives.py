import os
import re

def check_and_fix(dirs):
    hooks = ["useState", "useEffect", "useContext", "useReducer", "useCallback", "useMemo", "useRef", "useLayoutEffect"]
    hook_pattern = "|".join(hooks)
    radix_pattern = "@radix-ui"

    fixed_count = 0
    for d in dirs:
        if not os.path.exists(d): continue
        for root, _, files in os.walk(d):
            for file in files:
                if file.endswith((".ts", ".tsx")):
                    path = os.path.join(root, file)
                    with open(path, "r", errors="ignore") as f:
                        content = f.read()

                    if re.search(hook_pattern, content) or radix_pattern in content:
                        if '"use client"' not in content and "'use client'" not in content:
                            new_content = '"use client";\n\n' + content
                            with open(path, "w") as f:
                                f.write(new_content)
                            fixed_count += 1
    return fixed_count

print(f"Fixed {check_and_fix(['src/components', 'src/hooks'])} files.")
