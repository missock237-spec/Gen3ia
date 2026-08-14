import os

base_path = "/app/conversations/6a7eef13d951a70015ac55b9/Gen3ia/packages"

files_to_read = [
    "core/package.json",
    "agent-engine/package.json",
    "core/src/db.ts",
    "core/src/env-validator.ts",
    "core/src/errors.ts",
    "core/src/logger.ts",
    "core/src/validation.ts",
    "core/src/index.ts",
    "core/src/repositories/base.repository.ts",
    "core/src/repositories/user.repository.ts",
    "core/src/repositories/agent.repository.ts",
    "core/src/repositories/credit-transaction.repository.ts",
    "core/src/repositories/index.ts",
    "core/src/services/user.service.ts",
    "core/src/services/agent.service.ts",
    "core/src/services/credit.service.ts",
    "core/src/services/index.ts",
    "agent-engine/src/index.ts"
]

for rel in files_to_read:
    full_path = os.path.join(base_path, rel)
    print("=" * 80)
    print(f"FILE: {rel}")
    print("=" * 80)
    if os.path.exists(full_path):
        with open(full_path, 'r', encoding='utf-8') as f:
            print(f.read())
    else:
        print("FILE NOT FOUND!")
    print("\n")

