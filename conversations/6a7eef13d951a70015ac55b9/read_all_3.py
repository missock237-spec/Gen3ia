import os

base_path = "/app/conversations/6a7eef13d951a70015ac55b9/Gen3ia/packages"

files = [
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

for f in files:
    full_path = os.path.join(base_path, f)
    print(f"=== START FILE: {f} ===")
    if os.path.exists(full_path):
        with open(full_path, "r", encoding="utf-8") as fp:
            lines = fp.readlines()
            for idx, line in enumerate(lines, 1):
                print(f"{idx:3d}: {line}", end="")
    else:
        print("NOT FOUND")
    print(f"\n=== END FILE: {f} ===\n")
