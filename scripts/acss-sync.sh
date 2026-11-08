#!/usr/bin/env bash
# Loads this site's ACSS settings into the ACSS control panel (Barks.co, a RunCloud
# WordPress install used for nothing else), regenerates the stylesheet, and copies it
# into this site. See agent-docs/acss-workflow.md.
#
# Usage (from the site repo root):
#   scripts/acss-sync.sh            import acss/settings.json, regenerate, copy CSS
#   scripts/acss-sync.sh --export   save the control panel's current settings into acss/settings.json
#   scripts/acss-sync.sh --status   just check the connection
#
# Connection settings live on Charlie's Mac, never in the repo (some repos are public):
#   ~/.lllc-acss      sets ACSS_SSH (an alias from ~/.ssh/config) and ACSS_WP_PATH
#                     (the WordPress folder on the server, e.g. /home/runcloud/webapps/<app>)
# Leave ACSS_SSH empty to use a WordPress install on this computer instead (e.g. LocalWP).
set -euo pipefail

[[ -f "$HOME/.lllc-acss" ]] && source "$HOME/.lllc-acss"
ACSS_SSH="${ACSS_SSH:-}"
ACSS_WP_PATH="${ACSS_WP_PATH:-}"
[[ -n "$ACSS_WP_PATH" ]] || { echo "Set ACSS_WP_PATH in ~/.lllc-acss first (agent-docs/acss-workflow.md, 'One-time setup')." >&2; exit 1; }

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS="$REPO/acss/settings.json"
OUT="$REPO/src/styles/acss"
REMOTE_TMP="/tmp/lllc-acss-$$"
UPLOADS="$ACSS_WP_PATH/wp-content/uploads/automatic-css"

# Run wp-cli on the control panel, and move files to and from it.
if [[ -n "$ACSS_SSH" ]]; then
  wp_()   { ssh "$ACSS_SSH" "cd '$ACSS_WP_PATH' && wp $*"; }
  put_()  { ssh "$ACSS_SSH" "mkdir -p $REMOTE_TMP" && scp -q "$1" "$ACSS_SSH:$REMOTE_TMP/$(basename "$1")"; echo "$REMOTE_TMP/$(basename "$1")"; }
  get_()  { scp -q "$ACSS_SSH:$1" "$2"; }
  list_() { ssh "$ACSS_SSH" "ls -1 '$UPLOADS'/*.css"; }
  clean_(){ ssh "$ACSS_SSH" "rm -rf $REMOTE_TMP"; }
else
  wp_()   { (cd "$ACSS_WP_PATH" && wp "$@"); }
  put_()  { echo "$1"; }
  get_()  { cp "$1" "$2"; }
  list_() { ls -1 "$UPLOADS"/*.css; }
  clean_(){ :; }
fi
trap clean_ EXIT

echo "Checking ACSS on the control panel${ACSS_SSH:+ ($ACSS_SSH)}..."
wp_ acss status >/dev/null || { echo "Can't reach ACSS on the control panel. Check ~/.lllc-acss and the SSH key (agent-docs/acss-workflow.md)." >&2; exit 1; }
[[ "${1:-}" == "--status" ]] && { echo "Connected. ACSS is responding."; exit 0; }

mkdir -p "$REPO/acss" "$OUT"

if [[ "${1:-}" == "--export" ]]; then
  if [[ -n "$ACSS_SSH" ]]; then
    ssh "$ACSS_SSH" "mkdir -p $REMOTE_TMP"
    wp_ acss settings export --file="$REMOTE_TMP/settings.json"
    get_ "$REMOTE_TMP/settings.json" "$SETTINGS"
  else
    wp_ acss settings export --file="$SETTINGS"
  fi
  echo "Saved the control panel's settings to acss/settings.json"
  exit 0
fi

[[ -f "$SETTINGS" ]] || { echo "No acss/settings.json yet. Create it first (agent-docs/acss-workflow.md)." >&2; exit 1; }

# Back up whatever the control panel held before, then load this site's settings.
BACKUP="$REPO/acss/.last-control-panel-backup.json"
if [[ -n "$ACSS_SSH" ]]; then
  ssh "$ACSS_SSH" "mkdir -p $REMOTE_TMP"
  wp_ acss settings export --file="$REMOTE_TMP/backup.json"
  get_ "$REMOTE_TMP/backup.json" "$BACKUP"
else
  wp_ acss settings export --file="$BACKUP"
fi
echo "Backed up the control panel's previous settings to acss/.last-control-panel-backup.json"

REMOTE_SETTINGS="$(put_ "$SETTINGS")"
wp_ acss settings import "$REMOTE_SETTINGS" --yes --skip-css
wp_ acss css regenerate

# Copy the generated stylesheets. Builder- and editor-specific files (Gutenberg, Bricks, Etch,
# ACSS 4's core-for-block-editor and core-for-iframe-editor, etc.) aren't needed.
rm -f "$OUT"/*.css
list_ | grep -viE 'gutenberg|bricks|etch|oxygen|elementor|breakdance|builder|editor' | while read -r f; do
  get_ "$f" "$OUT/$(basename "$f")"
done
ls "$OUT"/*.css >/dev/null 2>&1 || { echo "No stylesheets copied. Check where ACSS writes its files on the control panel and update UPLOADS." >&2; exit 1; }

echo "Copied into src/styles/acss/:"
for f in "$OUT"/*.css; do awk -v n="$(basename "$f")" -v b="$(wc -c <"$f")" 'BEGIN{printf "  %-40s %8.1f KB\n", n, b/1024}'; done
echo "Next: run the dev server and check the site. Don't commit until it looks right."
