import os

base_path = "/app/conversations/6a7eef13d951a70015ac55b9/Gen3ia/packages"

def print_file(rel):
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

print_file("core/src/db.ts")
print_file("core/src/env-validator.ts")
print_file("core/src/errors.ts")
print_file("core/src/logger.ts")
print_file("core/src/validation.ts")
print_file("core/src/index.ts")
