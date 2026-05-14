#!/usr/bin/env bash
set -e
cd /Users/sridhar-2917/FigmaWorkspace

for f in demo/*.html; do
  # Variant pill labels
  perl -i -pe 's|(<button class="pill"[^>]*data-ctrl-variant="[a-z]+"[^>]*>)Primary(</button>)|${1}Filled${2}|g' "$f"
  perl -i -pe 's|(<button class="pill"[^>]*data-ctrl-variant="[a-z]+"[^>]*>)Secondary(</button>)|${1}Outlined${2}|g' "$f"
  perl -i -pe 's|(<button class="pill"[^>]*data-ctrl-variant="[a-z]+"[^>]*>)Tertiary(</button>)|${1}Soft${2}|g' "$f"

  # pg-variant-label legacy text
  perl -i -pe 's|(<span class="pg-variant-label">)Secondary(</span>)|${1}Outlined${2}|g' "$f"
  perl -i -pe 's|(<span class="pg-variant-label">)Tertiary(</span>)|${1}Soft${2}|g' "$f"

  # data-ctrl-variant legacy attribute values
  perl -i -pe 's|data-ctrl-variant="primary"|data-ctrl-variant="filled"|g' "$f"
  perl -i -pe 's|data-ctrl-variant="secondary"|data-ctrl-variant="outlined"|g'  "$f"
  perl -i -pe 's|data-ctrl-variant="tertiary"|data-ctrl-variant="soft"|g'       "$f"

  # data-variant="<role>" shortcut → orthogonal pair
  perl -i -pe 's{data-variant="(brand|danger|warning|info|success|neutral)"(?![^<>]*data-role)}{data-variant="filled" data-role="$1"}g' "$f"

  # btn__label "Primary"/"Secondary"/"Tertiary" inside the canonical buttons
  perl -i -0pe 's|(<button[^>]*data-variant="filled"[^>]*>\s*<span class="btn__label">)Primary(</span>)|${1}Filled${2}|g' "$f"
  perl -i -0pe 's|(<button[^>]*data-variant="outlined"[^>]*>\s*<span class="btn__label">)Secondary(</span>)|${1}Outlined${2}|g' "$f"
  perl -i -0pe 's|(<button[^>]*data-variant="soft"[^>]*>\s*<span class="btn__label">)Tertiary(</span>)|${1}Soft${2}|g' "$f"
done

echo "=== Verification ==="
echo "1. Variant pills with legacy labels (should be 0):"
grep -rcE 'data-ctrl-variant="(filled|outlined|soft|ghost)"[^>]*>(Primary|Secondary|Tertiary)<' demo/*.html | grep -v ':0$' || echo "  (clean)"

echo ""
echo "2. data-variant=<role> shortcuts (should be 0):"
grep -rcE 'data-variant="(brand|danger|warning|info|success|neutral)"' demo/*.html | grep -v ':0$' || echo "  (clean)"

echo ""
echo "3. pg-variant-label with legacy text (should be 0):"
grep -rcE 'pg-variant-label">(Primary|Secondary|Tertiary)<' demo/*.html | grep -v ':0$' || echo "  (clean)"

echo ""
echo "4. _TEMPLATE.html cleanup (legacy data-ctrl-variant):"
grep -nE 'data-ctrl-variant=' demo/_TEMPLATE.html || echo "  (none)"
