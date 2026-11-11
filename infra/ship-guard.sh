#!/bin/bash
# ship-guard.sh <client|server>: only origin/main goes live (owner, 2026-11-06: sessions shipped their own branches and
# each ship silently dropped the others' fixes). Sourced by infra/ship-client.sh and server/scripts/deploy.sh before
# anything is uploaded. Refuses unless
#   - HEAD is exactly origin/main (fetched now): committed, pushed, nothing else;
#   - no tracked file differs from it (untracked build output is fine);
#   - what is live now is already in it: refs/tags/live/<part> (moved by every ship, below) and, for the client, the
#     page's own yo2-build commit. A hand-swapped file is not in either, so don't: ship from main.
# After a ship succeeds, ship_guard_done <part> moves live/<part> to HEAD and pushes the tag.
# DRY=1 (a local test page) skips the check: any branch may be built and served locally, only main goes up.
ship_guard() {
  local part=$1 root; root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
  [ -n "${DRY:-}" ] && { echo "ship-guard: DRY, not checked"; return 0; }
  git -C "$root" fetch -q origin main "+refs/tags/live/*:refs/tags/live/*" || { echo "ship-guard: fetch failed" >&2; exit 1; }
  local head main; head=$(git -C "$root" rev-parse HEAD); main=$(git -C "$root" rev-parse origin/main)
  [ "$head" = "$main" ] || { echo "ship-guard: HEAD ${head:0:7} is not origin/main ${main:0:7}. Only main ships: merge your branch into main, push, and ship from main." >&2; exit 1; }
  [ -z "$(git -C "$root" status --porcelain -uno)" ] || { echo "ship-guard: tracked files differ from main (git status): commit them to main first" >&2; exit 1; }
  local live; live=$(git -C "$root" rev-parse -q --verify "refs/tags/live/$part^{commit}" || true)
  [ -n "$live" ] || { echo "ship-guard: no live/$part tag on origin: tag the commit that is live first" >&2; exit 1; }
  git -C "$root" merge-base --is-ancestor "$live" HEAD || { echo "ship-guard: live/$part ${live:0:7} is not in main: merge it first" >&2; exit 1; }
  if [ "$part" = client ] && [ -n "${SITE:-}" ]; then
    local b; b=$(curl -sf "$SITE/yo2rc.html" | sed -n 's/.*name="yo2-build" content="\([0-9a-f]*\)".*/\1/p' | head -1)
    [ -n "$b" ] || { echo "ship-guard: can't read the live page's yo2-build" >&2; exit 1; }
    git -C "$root" merge-base --is-ancestor "$b" HEAD 2>/dev/null || { echo "ship-guard: the live page is build $b, which is not in main: merge it first" >&2; exit 1; }
  fi
  echo "ship-guard: main ${head:0:7}, contains live/$part ${live:0:7}"
}
ship_guard_done() {
  [ -n "${DRY:-}" ] && return 0
  local root; root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
  git -C "$root" tag -f "live/$1" HEAD >/dev/null && git -C "$root" push -qf origin "refs/tags/live/$1" \
    && echo "ship-guard: live/$1 -> $(git -C "$root" rev-parse --short HEAD)" \
    || echo "ship-guard: SHIPPED, but pushing tag live/$1 failed: push it by hand (git push -f origin live/$1)" >&2
}
