import os

base_path = "/app/conversations/6a7eef13d951a70015ac55b9/Gen3ia/packages/core/src"

test_files = [
    "env-validator.test.ts",
    "errors.test.ts",
    "services/agent.service.test.ts",
    "services/credit.service.test.ts",
    "services/user.service.test.ts"
]

for tf in test_files:
    full_path = os.path.join(base_path, tf)
    print("=" * 80)
    print(f"TEST FILE: {tf}")
    print("=" * 80)
    if os.path.exists(full_path):
        with open(full_path, "r", encoding="utf-8") as f:
            print(f.read())
    else:
        print("NOT FOUND")
    print("\n")
