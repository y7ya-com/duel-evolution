#!/bin/bash
# Run the real yo2.exe Ver.080912 natively on this Mac under Boxedwine 26R1 (macOS build, not the web one), with
# yo2rep.dll loaded as version.dll. One instance at a time, killed after $SECS seconds (default 180).
#
#   harness/boxedwine/run.sh            # with every replacement patched in
#   YO2REP=off harness/boxedwine/run.sh # the untouched original (DLL loaded, nothing patched)
#   YO2REP=689ea0 harness/boxedwine/run.sh
#   AUTOMATION=<dir in the container> ...   # play <dir>/script.txt (Boxedwine -automation); see smoke.sh
#
# Setup and layout: harness/README.md ("Running the real exe"). The app is in $BW; it is App-Sandboxed, so everything
# it reads or writes (Wine zip, root, game folder, log) lives in its container, $W.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
DATA=${YO2_DATA:-$HOME/Documents/GitHub/yo2-decomp-data}
BW=$DATA/boxedwine
W=~/Library/Containers/org.boxedwine/Data/yo2
SEVENZ=${YO2_7Z:-$HOME/Documents/GitHub/duel-evolution-restore/extraction/recovery/yo2_2008-11_Extracted.7z}
SECS=${SECS:-180}
# The Wine filesystem 26R1's own catalog (boxedwine.org/v2/26R1/filesV2.xml) installs on Mac. v2/22 (Wine 11, built for
# Boxedwine master) wedges 26R1: explorer spins on "Vulkan not compiled into Boxedwine" before any DllMain runs.
WINEZIP=${WINEZIP:-TinyCore15Wine10.0.zip}

free=$(memory_pressure | tail -1 | grep -o '[0-9]*')
[ "$free" -ge "${MINFREE:-61}" ] || { echo "only $free% memory free (need ${MINFREE:-61}%): not starting"; exit 1; }
pgrep -x Boxedwine >/dev/null && { echo "Boxedwine already running: one instance at a time"; exit 1; }
[ -x "$BW/Boxedwine.app/Contents/MacOS/Boxedwine" ] || { echo "no $BW/Boxedwine.app (see README)"; exit 1; }
[ -f "$W/$WINEZIP" ] || { echo "no $W/$WINEZIP (see README)"; exit 1; }

# Game folder: APFS clones (cp -c) of copies that already exist, so it takes no extra disk and the game's writes
# never reach the originals. Only system.bin differs from those copies; it comes out of the 7z (628 bytes).
G=$W/game
if [ ! -f "$G/yo2.exe" ]; then
  mkdir -p "$G"
  R=$(dirname "$SEVENZ")
  cp -c "$R/merge.dat" "$R/merge.log" "$G/"
  cp -c "$DATA/yo2.exe" "$DATA/MagicKey.dll" "$G/"
  cp -c "$HOME/Documents/GitHub/duel-evolution-restore/Yu-Gi-Oh! ONLINE 2/"{Sound.dat,TestData.dat} "$G/"
  7zz e -y -o"$G" "$SEVENZ" system.bin >/dev/null
  (cd "$G" && 7zz h -scrcCRC32 merge.dat Sound.dat system.bin TestData.dat MagicKey.dll yo2.exe | grep -E '^[0-9A-F]{8} ')
fi

rm -f "$G/yo2rep.log" "$G/yo2net.log"
cp "$HERE/../../build-i686/harness/yo2rep.dll" "$G/version.dll"
# YOLaucher's network DLL (127.0.0.1 redirects), chain-loaded by yo2rep as yo2net.dll; flags from its build_dll.ps1.
D=${YOLAUNCHER:-$HOME/Documents/GitHub/YOLaucher-web}/tools/yo2emu/launcher/juego/dll
i686-w64-mingw32-gcc -O2 -s -shared -nostdlib -ffreestanding -fno-builtin -fno-stack-protector \
  -Wl,--entry,_DllMain@12 "$D/yo2net.c" "$D/version.def" -lkernel32 -luser32 -lgdi32 -o "$TMPDIR/yo2net.dll"
cp "$TMPDIR/yo2net.dll" "$G/"   # ld can't write into the sandbox container directly
# version.dll override (WINEDLLOVERRIDES from the environment is ignored), and WineD3D on OpenGL: Wine 11 otherwise
# probes its Vulkan renderer, which this Boxedwine build lacks ("Vulkan not compiled into Boxedwine", in a loop).
printf 'REGEDIT4\r\n\r\n[HKEY_CURRENT_USER\\Software\\Wine\\DllOverrides]\r\n"version"="native,builtin"\r\n\r\n[HKEY_CURRENT_USER\\Software\\Wine\\Direct3D]\r\n"renderer"="gl"\r\n' > "$G/yo2.reg"
printf 'regedit /S yo2.reg\r\nyo2.exe\r\n' > "$G/run.bat"

# -opengl osmesa: the bundled software Mesa (what the UI picks for non-native OpenGL). Mac hardware GL gives WineD3D
# "NULL GL_RENDERER", so D3D8 can't create an adapter. BW_OPENGL=native to retry it.
R=$W/root-${WINEZIP%.zip}   # the writable overlay belongs to one filesystem
mkdir -p "$R"
auto=()
if [ -n "${AUTOMATION:-}" ]; then
  auto=(-automation "$AUTOMATION")   # must come before the program; exits 111 when script.txt has played through
  cd "$AUTOMATION"                   # failed.bmp / failed_diff.bmp land in the working directory
fi
"$BW/Boxedwine.app/Contents/MacOS/Boxedwine" ${auto[@]+"${auto[@]}"} -root "$R" -zip "$W/$WINEZIP" \
  -opengl "${BW_OPENGL:-osmesa}" -mount_drive "$G" d -w /mnt/drive_d -nosound -resolution 1024x768 -log "$W/boxedwine.log" \
  -env "YO2REP=${YO2REP:-all}" -env "WINEDEBUG=${WINEDEBUG:-+loaddll}" -env YO2ONLINE_NET=1 -env YO2ONLINE_NET_LOG=yo2net.log -env "YO2ONLINE_SKIPINTRO=${SKIPINTRO:-0}" -env "YO2ONLINE_OFFSET=${OFFSET:-0}" /bin/wine cmd /c run.bat &
pid=$!
trap 'kill $pid 2>/dev/null; sleep 1; pkill -x Boxedwine 2>/dev/null || true' EXIT
peak=0 peak_at=0 t0=$SECONDS
for _ in $(seq "$SECS"); do
  kill -0 $pid 2>/dev/null || break
  free=$(memory_pressure | tail -1 | grep -o '[0-9]*')
  [ "$free" -ge 45 ] || { echo "memory down to $free% free: stopping Boxedwine"; break; }
  mb=$(( $(ps -o rss= -p $pid 2>/dev/null || echo 0) / 1024 ))   # tools/memcap.py's rule, from inside this loop
  [ "$mb" -le "$peak" ] || { peak=$mb; peak_at=$((SECONDS - t0)); }
  [ "$mb" -le "${RSS_MB:-2000}" ] || { echo "Boxedwine at $mb MB RSS > ${RSS_MB:-2000} MB cap: stopping it"; break; }
  sleep 1
done
{ ps -o rss= -p $pid 2>/dev/null || true; } | awk '{printf "Boxedwine RSS at stop: %d MB\n", $1/1024}'
rc=stopped
kill -0 $pid 2>/dev/null || { rc=0; wait $pid || rc=$?; }
echo "boxedwine-peak-rss=${peak}MB at ${peak_at}s"   # 0.8-1.3 GB is normal; growth past 1.5 GB = look for a leak
echo "boxedwine-exit=$rc"   # automation: 111 played through, 2 a step timed out, 1 the app quit early, 137 SIGKILL
echo "--- loaded DLLs"; grep -a "loaddll" "$W/boxedwine.log" | grep -ai "version\|yo2\|d3d8\|crt" | head -20 || true
echo "--- yo2rep.log"; cat "$G/yo2rep.log" 2>/dev/null || echo "(none: version.dll was not loaded)"
echo "--- yo2net.log"; tail -20 "$G/yo2net.log" 2>/dev/null || echo "(none)"
