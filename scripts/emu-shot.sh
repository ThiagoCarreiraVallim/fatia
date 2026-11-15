#!/bin/bash
# Print e toque no app (Expo Go no emulador), com trava: um agente por vez.
# Uso: scripts/emu-shot.sh shot <arquivo.png>
#      scripts/emu-shot.sh tap "<texto ou content-desc>"
#      scripts/emu-shot.sh open <rota>        (ex.: /nutrition; abre exp://<lan>:8081/--<rota>)
#      scripts/emu-shot.sh dump               (textos da tela)
#      scripts/emu-shot.sh back | scroll
# Rode tudo dentro de: flock /tmp/fatia-emu.lock scripts/emu-shot.sh ...
set -e
XML=/tmp/fatia-emu-ui.xml
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb shell cat /sdcard/ui.xml > $XML; }
case "$1" in
  shot) adb exec-out screencap -p > "$2"; echo "$2";;
  dump) dump; grep -o 'text="[^"]*"\|content-desc="[^"]*"' $XML | grep -v '=""' | head -${2:-80};;
  open) adb shell am start -a android.intent.action.VIEW -d "exp://192.168.18.37:8081/--$2" host.exp.exponent >/dev/null; sleep ${3:-4};;
  back) adb shell input keyevent 4; sleep 1;;
  scroll) adb shell input swipe 540 1700 540 600 300; sleep 1;;
  tap) dump; b=$(python3 - "$2" "$XML" <<'PY'
import re,sys
t,f=sys.argv[1],sys.argv[2]; x=open(f).read()
for m in re.finditer(r'<node [^>]*>',x):
  n=m.group(0)
  if f'text="{t}"' in n or f'content-desc="{t}"' in n:
    a=list(map(int,re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',n).groups()))
    print((a[0]+a[2])//2,(a[1]+a[3])//2); break
PY
); if [ -n "$b" ]; then adb shell input tap $b; sleep 1.5; echo "tap $b"; else echo "not found: $2"; exit 1; fi;;
esac
