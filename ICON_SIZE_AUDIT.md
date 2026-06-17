# Icon Size Token Audit — Design Token Forge

**Date**: 2026-06-17  
**Scope**: All 25 components with icon-size tokens  
**Goal**: Verify progressive scaling and consistency across all components

---

## Summary

✅ **GOOD** — Avatar, File-upload, Progress-bar have smooth +2px progressions  
⚠️ **NEEDS FIX** — 4 components have lumps, regresses, or hardcoded values

---

## Detailed Findings

### Button-Family (NOW STANDARDIZED TO 18px BASE)

#### Button: 12/12/16/18/20/20/24/24/32/32
- micro: 12px
- tiny: 12px (repeats)
- small: 16px
- **base: 18px** ✅ (just standardized)
- medium: 20px
- large: 20px (repeats)
- big: 24px
- huge: 24px (repeats)
- mega: 32px
- ultra: 32px (repeats)

**Status**: Paired steps (OK — intentional for supported sizes)

---

#### Split-button: INHERITS FROM BUTTON
- Now 12/12/16/18/20/20/24/24/32/32 ✅

---

#### Menu-button: 10/12/14/18/16/18/18/20/24/28
- micro: 10px
- tiny: 12px
- small: 14px
- base: 18px ✅ (just standardized)
- **medium: 16px ❌ REGRESSES (was 18 at base!)**
- large: 18px (back up)
- big: 18px (repeats)
- huge: 20px
- mega: 24px
- ultra: 28px

**Status**: ❌ BROKEN — medium goes backward 18→16. Should be 20px.

---

#### Icon-button: 12/14/16/18/20/22/24/28/32/36
- micro: 12px
- tiny: 14px
- small: 16px
- base: 18px ✅
- medium: 20px
- large: 22px
- big: 24px
- huge: 28px
- mega: 32px
- ultra: 36px

**Status**: ✅ PERFECT — smooth +2px progression

---

### Other Components

#### Avatar: 12/14/16/18/20/22/24/28/32/40
- Progression: +2px steps (mostly)
- **Status**: ✅ GOOD

---

#### Badge: 10/12/12/14/14/16/18/20/22/24
- tiny: 12px
- small: 12px (repeats) ❌
- base: 14px
- medium: 14px (repeats) ❌

**Status**: ⚠️ HAS LUMPS — repeats at tiny and base

---

#### File-upload: 14/16/18/20/22/24/28/32/36/40
- Progression: +2px steps
- **Status**: ✅ GOOD

---

#### Tooltip: 14/16/18 (ONLY 3 SIZES)
- small: 14px
- base: 16px
- large: 18px

**Status**: ⚠️ LIMITED — no micro/tiny/medium/big/huge/mega/ultra mapping

---

#### Progress-bar: 10/12/14/16/18/20/22/24/28/32
- Progression: +2px steps throughout
- **Status**: ✅ GOOD

---

#### Progress-ring: 8/10/12/14/18/20/24/28/32/40
- small: 12px
- base: 14px
- **medium: 18px ❌ LUMPY (jumps +4px)**
- large: 20px

**Status**: ⚠️ LUMPY — jump at medium (14→18)

---

#### Datepicker nav-icon-size: **ALL 16px** ❌❌❌
- micro: 16px
- tiny: 16px
- small: 16px
- base: 16px
- medium: 16px
- large: 16px
- big: 16px
- huge: 16px
- mega: 16px
- ultra: 16px

**Status**: ❌ CRITICAL — no scaling at all. Uses `--font-size-16` hardcoded. Should use spacing scale.

---

## Components WITH NO icon-size tokens

✅ Input, Checkbox, Radio, Toggle, Slider, Select, Spinner — these don't have icon-size tokens (correct — they don't have icon slots).

---

## Issues to Fix (Priority Order)

### 🔴 CRITICAL
1. **Datepicker nav-icon-size** — All 16px, should scale with density (use spacing scale, not font-size)

### 🟠 HIGH
2. **Menu-button icon-size-medium** — Regresses from 18→16, should be 20px
3. **Progress-ring icon-size** — Medium jumps 14→18, should be 16px for continuity

### 🟡 MEDIUM
4. **Badge icon-size** — Has repeats (12→12, 14→14), could smooth to 12/12/14/16/18/20/22/24/26/28
5. **Tooltip** — Only 3 sizes, should have all 10 densities (small/base/large map to what?)

---

## Recommended Fixes

### Fix 1: Menu-button medium
```diff
- --menu-btn-icon-size-medium: var(--spacing-16);
+ --menu-btn-icon-size-medium: var(--spacing-20);
```

### Fix 2: Progress-ring medium
```diff
- --ring-icon-size-medium: var(--spacing-18);
+ --ring-icon-size-medium: var(--spacing-16);
```

### Fix 3: Datepicker (convert from font-size to spacing scale)
```diff
- --datepicker-nav-icon-size-*: var(--font-size-16);
+ --datepicker-nav-icon-size-micro: var(--spacing-12);
+ --datepicker-nav-icon-size-tiny: var(--spacing-12);
+ --datepicker-nav-icon-size-small: var(--spacing-14);
+ --datepicker-nav-icon-size-base: var(--spacing-16);
+ --datepicker-nav-icon-size-medium: var(--spacing-18);
+ --datepicker-nav-icon-size-large: var(--spacing-20);
+ --datepicker-nav-icon-size-big: var(--spacing-22);
+ --datepicker-nav-icon-size-huge: var(--spacing-24);
+ --datepicker-nav-icon-size-mega: var(--spacing-28);
+ --datepicker-nav-icon-size-ultra: var(--spacing-32);
```

### Fix 4: Badge (smooth progression)
```diff
- --badge-icon-size-small: var(--spacing-12);  /* was repeating tiny */
+ --badge-icon-size-small: var(--spacing-14);

- --badge-icon-size-medium: var(--spacing-14);  /* was repeating base */
+ --badge-icon-size-medium: var(--spacing-16);

- --badge-icon-size-large: var(--spacing-16);
+ --badge-icon-size-large: var(--spacing-18);

- --badge-icon-size-big: var(--spacing-18);
+ --badge-icon-size-big: var(--spacing-20);

- --badge-icon-size-huge: var(--spacing-20);
+ --badge-icon-size-huge: var(--spacing-22);

- --badge-icon-size-mega: var(--spacing-22);
+ --badge-icon-size-mega: var(--spacing-24);

- --badge-icon-size-ultra: var(--spacing-24);
+ --badge-icon-size-ultra: var(--spacing-28);
```

### Fix 5: Tooltip (expand to full 10-density scale)
```diff
+ --tooltip-icon-size-micro: var(--spacing-10);
+ --tooltip-icon-size-tiny: var(--spacing-12);
  --tooltip-icon-size-small: var(--spacing-14);
  --tooltip-icon-size-base: var(--spacing-16);
+ --tooltip-icon-size-medium: var(--spacing-18);
  --tooltip-icon-size-large: var(--spacing-20);
+ --tooltip-icon-size-big: var(--spacing-22);
+ --tooltip-icon-size-huge: var(--spacing-24);
+ --tooltip-icon-size-mega: var(--spacing-28);
+ --tooltip-icon-size-ultra: var(--spacing-32);
```

---

## Reference: Ideal Progressive Scales

**Icon-button (smoothest — ideal baseline):**
12 → 14 → 16 → 18 → 20 → 22 → 24 → 28 → 32 → 36 (+2px steps)

**Button-family (acceptable with pairs):**
12 → 12 → 16 → 18 → 20 → 20 → 24 → 24 → 32 → 32

**Avatar/File-upload style (smooth):**
12 → 14 → 16 → 18 → 20 → 22 → 24 → 28 → 32 → 40 (+2px mostly)
