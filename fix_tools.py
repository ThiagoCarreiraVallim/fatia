import os, re

BASE = "/home/thiago/Documentos/thiago/fatia/apps/api/src/nutrition/mcp"

CONFIRMABLE_PREFIXES = (
    "log-meal", "add-meal-item", "update-meal-item", "create-custom-food",
    "set-nutrition-goals", "update-custom-food", "start-workout-session",
    "log-set", "log-weight", "log-steps", "log-water", "add-exercise-to-plan",
)

for filename in sorted(os.listdir(BASE)):
    if not filename.endswith(".tool.ts"):
        continue
    path = os.path.join(BASE, filename)
    with open(path) as f:
        content = f.read()
    
    match = re.search(r"readonly annotations = \{", content)
    if not match:
        print("SKIP " + filename)
        continue
    
    name_field = filename.replace(".tool.ts", "")
    prefix_ok = any(name_field.startswith(p) for p in CONFIRMABLE_PREFIXES)
    
    if prefix_ok:
        new_ann = "readOnlyHint: false, destructiveHint: false, confirmableHint: true"
    else:
        # Já é deletora ou read-only — manter como está (sem confirmar)
        print("NO CHANGE " + filename)
        continue
    
    old_pattern = r'readonly annotations = \{[^}]*\}'
    content = re.sub(old_pattern, 'readonly annotations = {' + new_ann + '}', content)
    with open(path, "w") as f:
        f.write(content)
    print("OK (confirmable) " + filename)

print("\nDone!")
