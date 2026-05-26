#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Design Token Forge — Gold Standard Compliance Audit
# Run: bash scripts/audit-gold-standard.sh
#
# Checks every component against 10 mandatory criteria.
# Exit code 0 = all pass, 1 = failures found.
# ═══════════════════════════════════════════════════════════════

COMP_DIR="packages/components/src"
PASS=0; FAIL=0; SKIP=0; TOTAL=0
FAILURES=""

# ── Colour helpers ──────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); }
fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); FAILURES="$FAILURES  ❌  $1 → $2\n"; }
skip() { SKIP=$((SKIP+1)); TOTAL=$((TOTAL+1)); }

# Safe grep count — returns integer even on error
gcount() { grep -c "$@" 2>/dev/null | tail -1 || echo 0; }
gcountE() { grep -cE "$@" 2>/dev/null | tail -1 || echo 0; }

# ── Per-component classification ────────────────────────────
get_category() {
  case "$1" in
    button|icon-button|menu-button|split-button) echo "action" ;;
    checkbox|radio|toggle|slider) echo "form-control" ;;
    input|textarea|select|datepicker|file-upload) echo "form-input" ;;
    alert|avatar|badge|toast) echo "display" ;;
    tooltip) echo "tooltip" ;;
    progress-bar|progress-ring) echo "indicator" ;;
    *) echo "unknown" ;;
  esac
}

# Components that should support data-rounded
# (slider/toggle excluded — inherently pill-shaped via radius-full track/thumb)
ROUNDED_REQUIRED="button icon-button menu-button split-button input textarea select datepicker file-upload progress-bar"
# Components that should support data-elevated
ELEVATED_REQUIRED="avatar badge progress-bar progress-ring button icon-button menu-button split-button"
# Components that should support data-loading
LOADING_REQUIRED="button icon-button menu-button split-button file-upload avatar badge slider toggle"

echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Design Token Forge — Gold Standard Audit${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

for dir in "$COMP_DIR"/*/; do
  comp=$(basename "$dir")
  css="$dir/${comp}.css"
  tok="$dir/${comp}.tokens.css"

  [ -f "$css" ] || continue
  [ -f "$tok" ] || continue

  cat=$(get_category "$comp")
  echo -e "${BOLD}▸ ${comp}${NC}  (${cat})"

  # ─── 1. TOKENS FILE EXISTS ───────────────────────────
  if [ -f "$tok" ]; then ok; else fail "$comp" "Missing tokens file"; fi

  # ─── 2. FORCED-COLORS SECTION ────────────────────────
  if grep -q 'forced-colors' "$css" 2>/dev/null; then
    ok
  else
    fail "$comp" "Missing forced-colors media query"
  fi

  # ─── 3. REDUCED-MOTION SECTION ───────────────────────
  if grep -q 'prefers-reduced-motion' "$css" 2>/dev/null; then
    # Check transition coverage
    has_transition=$(gcount 'transition' "$css")
    has_rm_transition=$(grep -A15 'prefers-reduced-motion' "$css" | gcount 'transition-duration\|transition.*none' -)
    if [ "$has_transition" -gt 0 ] && [ "$has_rm_transition" -eq 0 ]; then
      fail "$comp" "reduced-motion missing transition-duration override"
    else
      ok
    fi
    # Check animation coverage
    has_animation=$(gcountE '^\s*animation:' "$css")
    has_rm_animation=$(grep -A10 'prefers-reduced-motion' "$css" | gcount 'animation.*none\|animation-duration.*0' -)
    if [ "$has_animation" -gt 0 ] && [ "$has_rm_animation" -eq 0 ]; then
      fail "$comp" "reduced-motion missing animation:none for $has_animation animation rules"
    else
      ok
    fi
  else
    fail "$comp" "Missing prefers-reduced-motion media query"
  fi

  # ─── 4. @keyframes (if component uses animation:) ────
  has_animation=$(gcountE '^\s*animation:' "$css")
  has_keyframes=$(gcount '@keyframes' "$css")
  if [ "$has_animation" -gt 0 ]; then
    if [ "$has_keyframes" -gt 0 ]; then ok; else fail "$comp" "Uses animation: but has no @keyframes"; fi
  else
    skip  # No animation usage — keyframes not required
  fi

  # ─── 5. FOCUS OUTLINE-OFFSET TOKENISED ───────────────
  if [ "$cat" = "tooltip" ]; then
    skip  # Tooltip is non-interactive
  else
    has_fv=$(gcount 'focus-visible' "$css")
    if [ "$has_fv" -gt 0 ]; then
      has_offset_token=$(gcount 'outline-offset:.*var(' "$css")
      has_offset_token_def=$(gcount 'focus-outline-offset' "$tok")
      if [ "$has_offset_token" -gt 0 ] && [ "$has_offset_token_def" -gt 0 ]; then
        ok
      else
        fail "$comp" "outline-offset not tokenised (css=$has_offset_token, token=$has_offset_token_def)"
      fi
    else
      skip  # No focus-visible — skip
    fi
  fi

  # ─── 6. SHADOW TOKENS ───────────────────────────────
  shadow_count=$(gcount '\-shadow' "$tok")
  if [ "$shadow_count" -gt 0 ]; then ok; else fail "$comp" "No shadow tokens in tokens file"; fi

  # ─── 7. DATA-ROUNDED ─────────────────────────────────
  if echo "$ROUNDED_REQUIRED" | grep -wq "$comp"; then
    if grep -q 'data-rounded' "$css" 2>/dev/null; then
      # Also check token for rounded radius
      if grep -q 'radius-rounded\|radius-full' "$tok" 2>/dev/null; then
        ok
      else
        fail "$comp" "data-rounded in CSS but missing radius-rounded token"
      fi
    else
      fail "$comp" "Missing data-rounded selector (required for $cat)"
    fi
  else
    skip
  fi

  # ─── 8. DATA-STRONG (elevation axis; shipped name) ───
  if echo "$ELEVATED_REQUIRED" | grep -wq "$comp"; then
    if grep -q 'data-strong' "$css" 2>/dev/null; then
      if grep -q 'shadow-strong' "$tok" 2>/dev/null; then
        ok
      else
        fail "$comp" "data-strong in CSS but missing shadow-strong token"
      fi
    else
      fail "$comp" "Missing data-strong selector (required for $cat)"
    fi
  else
    skip
  fi

  # ─── 9. DATA-LOADING ─────────────────────────────────
  if echo "$LOADING_REQUIRED" | grep -wq "$comp"; then
    if grep -q 'data-loading' "$css" 2>/dev/null; then
      ok
    else
      fail "$comp" "Missing data-loading selector (required for $cat)"
    fi
  else
    skip
  fi

  # ─── 10. :has() SELECTORS (compound components) ──────
  # Only check components that genuinely benefit from :has() — those with optional
  # sub-elements that change outer layout (icon presence → padding, affix → border).
  # Skip: datepicker (static grid), menu-button (simple dropdown trigger),
  #        progress-ring (SVG-based), tooltip (non-interactive overlay)
  HAS_REQUIRED="button icon-button input select textarea split-button file-upload checkbox radio toggle slider alert badge avatar toast"
  if echo "$HAS_REQUIRED" | grep -wq "$comp"; then
    has_sub_elements=$(gcountE '__[a-z]' "$css")
    if [ "$has_sub_elements" -gt 3 ]; then
      if grep -q ':has(' "$css" 2>/dev/null; then
        ok
      else
        fail "$comp" "Compound component ($has_sub_elements sub-elements) but no :has() selectors"
      fi
    else
      skip
    fi
  else
    skip
  fi

  echo ""
done

# ─── Cross-component checks ───────────────────────────────

echo -e "${BOLD}▸ Cross-component: radius consistency${NC}"

# Form-input radius reference: input
REF_RADIUS=$(grep -E 'radius.*(micro|tiny|small|base|medium|large|big|huge|mega|ultra)' \
  "$COMP_DIR/input/input.tokens.css" 2>/dev/null | \
  grep -v 'rounded\|full\|none' | sed 's/.*var(//' | sed 's/).*//' | tr '\n' ',')

for sibling in textarea select file-upload; do
  SIB_RADIUS=$(grep -E 'radius.*(micro|tiny|small|base|medium|large|big|huge|mega|ultra)' \
    "$COMP_DIR/$sibling/$sibling.tokens.css" 2>/dev/null | \
    grep -v 'rounded\|full\|none' | sed 's/.*var(//' | sed 's/).*//' | tr '\n' ',')
  if [ "$SIB_RADIUS" = "$REF_RADIUS" ]; then
    ok
  else
    fail "$sibling" "Radius progression differs from input reference"
  fi
done

# Button-derivative radius reference: icon-button
REF_BTN=$(grep -E 'radius.*(micro|tiny|small|base|medium|large|big|huge|mega|ultra)' \
  "$COMP_DIR/icon-button/icon-button.tokens.css" 2>/dev/null | \
  grep -v 'rounded\|full\|none' | sed 's/.*var(//' | sed 's/).*//' | tr '\n' ',')

for sibling in menu-button split-button; do
  # split-button intentionally inherits radius via --btn-radius-* (multi-zone-model.md Q6).
  # Skip the literal-string diff for it; menu-button is checked normally.
  if [ "$sibling" = "split-button" ]; then
    if grep -q 'var(--btn-radius-' "$COMP_DIR/split-button/split-button.tokens.css"; then
      ok
      continue
    fi
  fi
  SIB_BTN=$(grep -E 'radius.*(micro|tiny|small|base|medium|large|big|huge|mega|ultra)' \
    "$COMP_DIR/$sibling/$sibling.tokens.css" 2>/dev/null | \
    grep -v 'rounded\|full\|none' | sed 's/.*var(//' | sed 's/).*//' | tr '\n' ',')
  if [ "$SIB_BTN" = "$REF_BTN" ]; then
    ok
  else
    fail "$sibling" "Radius progression differs from icon-button reference"
  fi
done

echo ""
echo -e "${BOLD}▸ Cross-component: theme-immune tokens${NC}"

# Check no component uses --color-white for surface tokens (should use --color-fixed-white)
for dir in "$COMP_DIR"/*/; do
  comp=$(basename "$dir")
  tok="$dir/${comp}.tokens.css"
  [ -f "$tok" ] || continue
  bad_white=$(grep -c 'var(--color-white)' "$tok" 2>/dev/null) || bad_white=0
  if [ "$bad_white" -gt 0 ]; then
    fail "$comp" "Uses --color-white ($bad_white refs) — use --color-fixed-white for theme-immune surfaces"
  else
    ok
  fi
done
echo ""

# ─── Summary ───────────────────────────────────────────────
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  AUDIT SUMMARY${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}✅ Pass: $PASS${NC}"
echo -e "  ${RED}❌ Fail: $FAIL${NC}"
echo -e "  ${YELLOW}➖ Skip: $SKIP${NC}"
echo -e "  Total checks: $TOTAL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${BOLD}${RED}FAILURES:${NC}"
  echo -e "$FAILURES"
  echo -e "${RED}Audit FAILED — $FAIL issue(s) to fix.${NC}"
  exit 1
else
  echo -e "${GREEN}${BOLD}All checks passed! ✅${NC}"
  exit 0
fi
