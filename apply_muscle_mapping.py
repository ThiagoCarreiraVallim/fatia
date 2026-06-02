#!/usr/bin/env python3
"""
Apply muscle group mapping to anatomy SVG files.
Renames <g id="OLD"> to <g id="NEW" data-muscle="VALUE"> and wraps
standalone <path> elements in <g> tags where needed.
"""

import re

# ─────────────────────────────────────────────────────────────────────────────
# BACK SVG
# ─────────────────────────────────────────────────────────────────────────────

BACK_SVG_PATH = '/home/user/fatia/docs/Muscular System Back.svg'

# (old_id, new_id, data_muscle_or_None)
BACK_RENAMES = [
    ("Group 325",   "base",                   None),
    ("Group 324",   "base-feet-right",         None),
    ("Group 323",   "base-feet-left",          None),
    ("Group 321",   "hamstrings",              "hamstrings"),
    ("Group 320",   "hamstrings-2",            "hamstrings"),
    ("Group 319",   "hamstrings-3",            "hamstrings"),
    ("Group 318",   "gluteus-maximus",         "glutes"),
    ("Group 322",   "gastrocnemius",           "calves"),
    ("Group 317",   "gluteus-maximus-2",       "glutes"),
    ("Group 316",   "gluteus-medius",          "abductors"),
    ("Group 315",   "gluteus-medius-2",        "abductors"),
    ("lower-back",  "erector-spinae",          "lower back"),
    ("Group 313",   "base-hands",              None),
    ("Group 297",   "base-head",               None),
    ("triceps",     "triceps",                 "triceps"),
    ("neck",        "splenius",                "neck"),
    ("middle-back", "infraspinatus",           "middle back"),
    ("lats",        "latissimus-dorsi",        "lats"),
    ("shoulders",   "deltoid-posterior",       "shoulders"),
    ("shoulders_2", "deltoid-posterior-2",     "shoulders"),
    ("shoulders_3", "deltoid-posterior-3",     "shoulders"),
    ("traps",       "trapezius-upper",         "traps"),
    (" traps",      "trapezius-middle",        "traps"),   # note leading space
    ("traps_2",     "trapezius-lower",         "traps"),
    ("forearms",    "forearms",                "forearms"),
    ("forearms_2",  "forearms-2",              "forearms"),
    ("forearms_3",  "forearms-3",              "forearms"),
    ("forearms_4",  "forearms-4",              "forearms"),
    ("forearms_5",  "forearms-5",              "forearms"),
    ("forearms_6",  "forearms-6",              "forearms"),
]

# ─────────────────────────────────────────────────────────────────────────────
# FRONT SVG
# ─────────────────────────────────────────────────────────────────────────────

FRONT_SVG_PATH = '/home/user/fatia/docs/Muscular System Front.svg'

FRONT_RENAMES = [
    ("Group 574",   "base",                       None),
    ("Group 187",   "face",                        None),
    ("Group 246",   "base-foot-right",             None),
    ("Group 247",   "base-foot-left",              None),
    ("Group 248",   "fibularis-longus",            "calves"),
    ("Group 249",   "base-ankle-right",            None),
    ("Vector 93",   "base-foot-2",                 None),
    ("Group 250",   "fibularis-longus-2",          "calves"),
    ("Group 251",   "base-foot-3",                 None),
    ("Vector 94",   "fibularis-longus-3",          "calves"),
    ("Group 252",   "base-foot-4",                 None),
    ("Vector 95",   "tibialis-anterior",           "calves"),
    ("Group 253",   "tibialis-anterior-2",         "calves"),
    ("Group 254",   "vastus-medialis",             "quadriceps"),
    ("Group 255",   "vastus-lateralis",            "quadriceps"),
    ("Group 256",   "vastus-lateralis-2",          "quadriceps"),
    ("Group 257",   "rectus-femoris",              "quadriceps"),
    ("Group 258",   "obliques",                    "abdominals"),
    ("Group 259",   "adductors",                   "adductors"),
    ("Group 260",   "adductors-2",                 "adductors"),
    ("Group 261",   "vastus-lateralis-3",          "quadriceps"),
    ("Group 262",   "obliques-2",                  "abdominals"),
    ("Group 263",   "obliques-3",                  "abdominals"),
    ("Group 293",   "forearms",                    "forearms"),
    ("Vector 96",   "forearms-2",                  "forearms"),
    ("Vector 97",   "forearms-3",                  "forearms"),
    ("Group 264",   "forearms-4",                  "forearms"),
    ("Group 265",   "serratus-anterior",           "chest"),
    ("Group 266",   "deltoid-lateral",             "shoulders"),
    ("Group 267",   "biceps-brachii",              "biceps"),
    ("Group 268",   "deltoid-anterior",            "shoulders"),
    ("Group 269",   "deltoid-anterior-2",          "shoulders"),
    ("Group 270",   "deltoid-lateral-2",           "shoulders"),
    ("Group 271",   "deltoid-lateral-3",           "shoulders"),
    ("Group 272",   "deltoid-anterior-3",          "shoulders"),
    ("Group 273",   "deltoid-anterior-4",          "shoulders"),
    ("Group 274",   "chest-abs-group",             None),
    ("Group 174",   "serratus-anterior-2",         "chest"),
    ("Group 171",   "pectoralis-major",            "chest"),
    ("Group 172",   "pectoralis-major-2",          "chest"),
    ("Group 168",   "pectoralis-major-3",          "chest"),
    ("Group 173",   "serratus-anterior-3",         "chest"),
    ("Group 169",   "pectoralis-major-4",          "chest"),
    ("Group 170",   "serratus-anterior-4",         "chest"),
    ("Group 167",   "pectoralis-major-5",          "chest"),
    ("Group 275",   "deltoid-anterior-5",          "shoulders"),
    ("Vector_23",   "rectus-abdominis-lower",      "abdominals"),
    ("Vector_24",   "pectoralis-major-6",          "chest"),
    ("Vector_25",   "rectus-abdominis",            "abdominals"),
    ("Vector_26",   "pectoralis-major-7",          "chest"),
    ("Group 276",   "deltoid-anterior-6",          "shoulders"),
    ("Group 277",   "sternocleidomastoid",         "neck"),
    ("Group 162",   "sternocleidomastoid-2",       "neck"),
    ("Group 163",   "sternocleidomastoid-3",       "neck"),
    ("Vector_31",   "sternocleidomastoid-4",       "neck"),
    ("Group 278",   "sternocleidomastoid-5",       "neck"),
    ("Vector 101",  "face-2",                      None),
    ("Vector 102",  "face-3",                      None),
    ("Vector 103",  "face-4",                      None),
    ("Vector 104",  "face-5",                      None),
    ("Group 279",   "face-6",                      None),
    ("Vector 105",  "face-7",                      None),
    ("Vector 106",  "face-8",                      None),
    ("Group 280",   "face-9",                      None),
    ("Group 281",   "face-10",                     None),
    ("Group 282",   "face-11",                     None),
    ("Group 283",   "face-12",                     None),
    ("Vector_34",   "face-13",                     None),
    ("Group 284",   "face-14",                     None),
    ("Group 285",   "face-15",                     None),
    ("Group 599",   "shoulders-outer-group",       None),
    ("Group 330",   "deltoid-lateral-4",           "shoulders"),
    ("Group 575",   "deltoid-lateral-5",           "shoulders"),
]


def build_replacement(new_id, data_muscle):
    """Build the replacement opening tag string."""
    if data_muscle:
        return f'<g id="{new_id}" data-muscle="{data_muscle}">'
    else:
        return f'<g id="{new_id}">'


def apply_renames(content, renames, svg_label):
    """Apply all group renames to content. Returns (new_content, changes_list)."""
    changes = []
    for old_id, new_id, data_muscle in renames:
        old_tag = f'<g id="{old_id}">'
        new_tag = build_replacement(new_id, data_muscle)
        if old_tag in content:
            content = content.replace(old_tag, new_tag, 1)  # replace exactly once
            changes.append(f'  [{svg_label}] "{old_id}" → "{new_id}"' +
                           (f' data-muscle="{data_muscle}"' if data_muscle else ''))
        else:
            print(f'  WARNING [{svg_label}]: Could not find <g id="{old_id}"> — skipped')
    return content, changes


def wrap_paths(content, path_ids, wrapper_id, data_muscle, svg_label):
    """
    Wrap the given path_ids (in order, as adjacent lines) in a <g> wrapper.
    Finds the first path in the list, locates all the path lines as a block,
    and wraps them.
    """
    # Build patterns for each path
    # We'll find the region between the first and last path
    # Paths appear on separate lines (or at least as separate occurrences)

    # Extract each path element (from <path id="X" to the closing />)
    path_pattern = re.compile(r'<path id="(?:' + '|'.join(re.escape(pid) for pid in path_ids) + r')"[^>]*/>', re.DOTALL)
    found = path_pattern.findall(content)

    if len(found) != len(path_ids):
        print(f'  WARNING [{svg_label}]: Expected {len(path_ids)} paths for wrapper "{wrapper_id}", found {len(found)} — skipped')
        return content, False

    # Now find the contiguous block: from first path start to last path end
    # We need to verify all paths appear consecutively (possibly with whitespace between)

    # Build a pattern that matches all paths in sequence with optional whitespace
    seq_parts = []
    for pid in path_ids:
        seq_parts.append(r'(<path id="' + re.escape(pid) + r'"[^>]*/>)')
    # Allow any whitespace (including newlines) between paths
    seq_pattern = re.compile(r'\s*'.join(seq_parts), re.DOTALL)

    m = seq_pattern.search(content)
    if not m:
        print(f'  WARNING [{svg_label}]: Could not find consecutive paths for wrapper "{wrapper_id}" — skipped')
        return content, False

    # Build wrapper
    if data_muscle:
        open_tag = f'<g id="{wrapper_id}" data-muscle="{data_muscle}">'
    else:
        open_tag = f'<g id="{wrapper_id}">'

    # Get the original block
    original_block = m.group(0)
    wrapped = open_tag + original_block + '</g>'
    content = content[:m.start()] + wrapped + content[m.end():]
    return content, True


# ─────────────────────────────────────────────────────────────────────────────
# PROCESS BACK SVG
# ─────────────────────────────────────────────────────────────────────────────

print("=" * 60)
print("Processing BACK SVG")
print("=" * 60)

with open(BACK_SVG_PATH, 'r', encoding='utf-8') as f:
    back_content = f.read()

back_g_open_before = back_content.count('<g ')
back_g_close_before = back_content.count('</g>')

# Step 1: Apply group renames
back_content, back_changes = apply_renames(back_content, BACK_RENAMES, 'Back')
print(f"\nGroup renames applied: {len(back_changes)}")
for c in back_changes:
    print(c)

# Step 2: Wrap standalone paths
print("\nWrapping standalone paths in Back SVG...")

# Wrap 1: Vector 145 + Vector 146 → gastrocnemius-lower (calves)
back_content, ok = wrap_paths(back_content, ["Vector 145", "Vector 146"],
                               "gastrocnemius-lower", "calves", "Back")
if ok:
    print('  Wrapped "Vector 145" + "Vector 146" → gastrocnemius-lower (calves)')

# Wrap 2: Vector 137, 138, 136, 135 → hamstrings-outer (hamstrings)
back_content, ok = wrap_paths(back_content, ["Vector 137", "Vector 138", "Vector 136", "Vector 135"],
                               "hamstrings-outer", "hamstrings", "Back")
if ok:
    print('  Wrapped "Vector 137/138/136/135" → hamstrings-outer (hamstrings)')

# Wrap 3: Vector_25 alone → base-neck (no data-muscle)
back_content, ok = wrap_paths(back_content, ["Vector_25"],
                               "base-neck", None, "Back")
if ok:
    print('  Wrapped "Vector_25" → base-neck')

# Wrap 4: Vector_26 + Vector_27 → gastrocnemius-2 (calves)
back_content, ok = wrap_paths(back_content, ["Vector_26", "Vector_27"],
                               "gastrocnemius-2", "calves", "Back")
if ok:
    print('  Wrapped "Vector_26" + "Vector_27" → gastrocnemius-2 (calves)')

# Verify balance
back_g_open_after = back_content.count('<g ')
back_g_close_after = back_content.count('</g>')
print(f"\nBack SVG validation:")
print(f"  <g  opens : before={back_g_open_before}, after={back_g_open_after}")
print(f"  </g> closes: before={back_g_close_before}, after={back_g_close_after}")
if back_g_open_after == back_g_close_after:
    print("  OK: <g> tags are balanced")
else:
    print("  ERROR: <g> tags are NOT balanced!")

with open(BACK_SVG_PATH, 'w', encoding='utf-8') as f:
    f.write(back_content)
print(f"\nSaved: {BACK_SVG_PATH}")


# ─────────────────────────────────────────────────────────────────────────────
# PROCESS FRONT SVG
# ─────────────────────────────────────────────────────────────────────────────

print("\n" + "=" * 60)
print("Processing FRONT SVG")
print("=" * 60)

with open(FRONT_SVG_PATH, 'r', encoding='utf-8') as f:
    front_content = f.read()

front_g_open_before = front_content.count('<g ')
front_g_close_before = front_content.count('</g>')

# Apply group renames
front_content, front_changes = apply_renames(front_content, FRONT_RENAMES, 'Front')
print(f"\nGroup renames applied: {len(front_changes)}")
for c in front_changes:
    print(c)

# Verify balance
front_g_open_after = front_content.count('<g ')
front_g_close_after = front_content.count('</g>')
print(f"\nFront SVG validation:")
print(f"  <g  opens : before={front_g_open_before}, after={front_g_open_after}")
print(f"  </g> closes: before={front_g_close_before}, after={front_g_close_after}")
if front_g_open_after == front_g_close_after:
    print("  OK: <g> tags are balanced")
else:
    print("  ERROR: <g> tags are NOT balanced!")

with open(FRONT_SVG_PATH, 'w', encoding='utf-8') as f:
    f.write(front_content)
print(f"\nSaved: {FRONT_SVG_PATH}")

print("\n" + "=" * 60)
print("DONE")
print("=" * 60)
