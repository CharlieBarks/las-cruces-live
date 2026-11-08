#!/usr/bin/env bash
# Loads this site's ACSS settings into the control-panel WordPress, regenerates the
# stylesheet, and copies it into the site. See agent-docs/acss-workflow.md.
#
# Usage (from the site repo root):
#   scripts/acss-sync.sh            import acss/settings.json, regenerate, copy CSS
#   scripts/acss-sync.sh --export   save the control panel's current settings into acss/settings.json
#
# Settings (override with environment variables):
#   ACSS_WP_PATH  path to the control-panel WordPress (LocalWP default below)
#   WP            the wp-cli command (default: "wp")
set -euo pipefail

ACSS_WP_PATH="${ACSS_WP_PATH:-$HOME/Local Sites/acss-control-panel/app/public}"
WP="${WP:-wp}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS="$REPO/acss/settings.json"
OUT="$REPO/src/styles/acss"
UPLOADS="$ACSS_WP_PATH/wp-content/uploads/automatic-css"

wp_() { $WP --path="$ACSS_WP_PATH" "$@"; }

echo "Checking ACSS on the control panel..."
wp_ acss status >/dev/null || {
  echo "Can't reach ACSS. Is LocalWP running? Try this script from Local's 'Open Site Shell', or set WP / ACSS_WP_PATH." >&2
  exit 1
}

mkdir -p "$REPO/acss" "$OUT"

if [[ "${1:-}" == "--export" ]]; then
  wp_ acss settings export --file="$SETTINGS"
  echo "Saved control-panel settings to acss/settings.json"
  exit 0
fi

[[ -f "$SETTINGS" ]] || { echo "No acss/settings.json yet. Create it first (agent-docs/acss-workflow.md)." >&2; exit 1; }

BACKUP="$REPO/acss/.last-control-panel-backup.json"
wp_ acss settings export --file="$BACKUP"
echo "Backed up the control panel's previous settings to acss/.last-control-panel-backup.json"

wp_ acss settings import "$SETTINGS" --yes --skip-css
wp_ acss css regenerate

[[ -d "$UPLOADS" ]] || { echo "Generated CSS not found at $UPLOADS. Check where ACSS writes its files and update UPLOADS." >&2; exit 1; }

# Copy the generated stylesheets. Builder-specific files (Gutenberg, Bricks, Etch, etc.) aren't needed.
rm -f "$OUT"/*.css
find "$UPLOADS" -maxdepth 1 -name '*.css' ! -iname '*gutenberg*' ! -iname '*bricks*' ! -iname '*etch*' \
  ! -iname '*oxygen*' ! -iname '*elementor*' ! -iname '*breakdance*' ! -iname '*builder*' -exec cp {} "$OUT"/ \;

echo "Copied into src/styles/acss/:"
ls -la "$OUT" | awk 'NR>1 {printf "  %-40s %8.1f KB\n", $9, $5/1024}'
echo "Next: run the dev server and check the site. Don't commit until it looks right."
