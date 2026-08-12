"""Reseta todas as .tool.ts para o estado correto de anotações."""
import os, re

BASE = "/home/thiago/Documentos/thiago/fatia/apps/api/src/nutrition/mcp"

# Mapping: filename_base -> (readOnlyHint, destructiveHint, confirmableHint)
ANNOTATIONS = {
    # READ_ONLY - leitura pura
    "get-meal":                    ("true",  "false", "false"),
    "list-meals":                  ("true",  "false", "false"),
    "search-food":                 ("true",  "false", "false"),
    "get-food":                    ("true",  "false", "false"),
    "list-food-groups":            ("true",  "false", "false"),
    "get-nutrition-goals":         ("true",  "false", "false"),
    "get-nutrition-history":       ("true",  "false", "false"),
    "get-nutrition-summary":       ("true",  "false", "false"),
    "get-nutrient-summary":        ("true",  "false", "false"),
    "get-streak":                  ("true",  "false", "false"),
    "list-achievements":           ("true",  "false", "false"),
    "refresh-achievements":        ("true",  "false", "false"),
    "get-load-prescription":       ("true",  "false", "false"),
    "explain-form":                ("true",  "false", "false"),
    "clone-exercise":              ("true",  "false", "false"),
    "get-exercise-details":        ("true",  "false", "false"),
    "get-last-set-for-exercise":   ("true",  "false", "false"),
    "get-personal-record":         ("true",  "false", "false"),
    "list-personal-records":       ("true",  "false", "false"),
    "get-water-for-date":          ("true",  "false", "false"),
    "get-water-history":           ("true",  "false", "false"),
    "get-water-progress":          ("true",  "false", "false"),
    "get-steps-for-date":          ("true",  "false", "false"),
    "get-steps-history":           ("true",  "false", "false"),
    "get-weight-progress":         ("true",  "false", "false"),
    "get-strength-progress":       ("true",  "false", "false"),
    "get-volume-progress":         ("true",  "false", "false"),
    "get-cardio-progress":         ("true",  "false", "false"),
    "get-today-summary":           ("true",  "false", "false"),
    "get-week-summary":            ("true",  "false", "false"),
    "list-my-groups":              ("true",  "false", "false"),
    "list-data-access-log":        ("true",  "false", "false"),
    "list-data-sharing":           ("true",  "false", "false"),
    "list-nutrient-targets":       ("true",  "false", "false"),

    # CONFIRMABLE - reversível/idempotente, precisa de OK na tela
    "log-meal":                    ("false", "false", "true"),
    "add-meal-item":               ("false", "false", "true"),
    "update-meal-item":            ("false", "false", "true"),
    "create-custom-food":          ("false", "false", "true"),
    "set-nutrition-goals":         ("false", "false", "true"),
    "update-custom-food":          ("false", "false", "true"),
    "start-workout-session":       ("false", "false", "true"),
    "log-set":                     ("false", "false", "true"),
    "log-weight":                  ("false", "false", "true"),
    "log-steps":                   ("false", "false", "true"),
    "log-water":                   ("false", "false", "true"),
    "add-exercise-to-plan":        ("false", "false", "true"),

    # RESTRICTED - deletoras irreversíveis (destroy=true, confirm=false)
}

for filename in sorted(os.listdir(BASE)):
    if not filename.endswith(".tool.ts"):
        continue
    path = os.path.join(BASE, filename)
    with open(path) as f:
        content = f.read()

    name_field = filename.replace(".tool.ts", "")

    # Se não tem annotation, pula (não acontece hoje mas é robusto)
    if "annotations" not in content:
        print("SKIP " + filename)
        continue

    if name_field in ANNOTATIONS:
        rh, dh, ch = ANNOTATIONS[name_field]
        new_ann = f'readonly annotations = {{readOnlyHint: {rh}, destructiveHint: {dh}, confirmableHint: {ch}}}'
        print(f"SET   {filename} -> readOnly={rh}, destroy={dh}, confirm={ch}")
    else:
        # Arquivo deletora (delete_*) — define como RESTRICTED
        if name_field.startswith("delete-"):
            new_ann = 'readonly annotations = {readOnlyHint: false, destructiveHint: true, confirmableHint: false}'
            print(f"SET   {filename} -> readOnly=false, destroy=true, confirm=false (deletora)")
        else:
            # update-meal e set-nutrient-target — confirmáveis genéricos
            if name_field in ("update-meal", "set-nutrient-target"):
                new_ann = 'readonly annotations = {readOnlyHint: false, destructiveHint: false, confirmableHint: true}'
                print(f"SET   {filename} -> readOnly=false, destroy=false, confirm=true")
            else:
                # Não mapeada — manter sem alterar (fallback)
                print("KEEP " + filename)
                continue

    old_pattern = r'readonly annotations = \{[^}]*\}'
    content = re.sub(old_pattern, new_ann, content)
    with open(path, "w") as f:
        f.write(content)
    print(f"OK   {filename}")

print("\nDone!")
