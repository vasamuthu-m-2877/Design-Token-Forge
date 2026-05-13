# The Definitive Figma Component Construction Standard

> **Version**: 1.0 · **Last Updated**: May 2026  
> **Scope**: A complete, never-before-documented standard for building production-grade Figma components that use the full power of the platform.  
> **Audience**: Design system engineers, AI component generators, plugin developers.  
> **Future-Proof**: Written as abstract rules with versioned Figma API mappings. When Figma adds new features, extend the mapping layer — the standard remains stable.

---

## Table of Contents

1. [Philosophy](#1-philosophy)
2. [The 15 Construction Axes](#2-the-15-construction-axes)
3. [Axis 1: Frame Hierarchy](#axis-1-frame-hierarchy)
4. [Axis 2: Auto-Layout](#axis-2-auto-layout)
5. [Axis 3: Sizing Rules](#axis-3-sizing-rules)
6. [Axis 4: Layer Naming](#axis-4-layer-naming)
7. [Axis 5: Variant Properties](#axis-5-variant-properties)
8. [Axis 6: Boolean Properties](#axis-6-boolean-properties)
9. [Axis 7: Instance Swap Properties](#axis-7-instance-swap-properties)
10. [Axis 8: Text Properties](#axis-8-text-properties)
11. [Axis 9: Nested Property Exposure](#axis-9-nested-property-exposure)
12. [Axis 10: Color Variables](#axis-10-color-variables)
13. [Axis 11: Number Variables](#axis-11-number-variables)
14. [Axis 12: Variable Scoping](#axis-12-variable-scoping)
15. [Axis 13: Variable Modes](#axis-13-variable-modes)
16. [Axis 14: Interactive Components](#axis-14-interactive-components)
17. [Axis 15: Responsive & Constraints](#axis-15-responsive--constraints)
18. [Decision Framework](#3-decision-framework)
19. [Anti-Patterns](#4-anti-patterns)
20. [CSS ↔ Figma Mapping Table](#5-css--figma-mapping-table)
21. [Component Complexity Tiers](#6-component-complexity-tiers)
22. [Plugin API Reference Map](#7-plugin-api-reference-map)
23. [Future-Proofing Strategy](#8-future-proofing-strategy)
24. [Worked Example: Button](#9-worked-example-button)

---

## 1. Philosophy

### Why This Document Exists

Figma documents individual features. Nobody documents how all 15 features combine to produce a **production-grade component**. This gap causes:

- Designers build components at 30-40% of Figma's capability
- AI tools produce visual fakes with no structural intelligence
- Design systems drift from code because the Figma side is underpowered
- Teams rebuild components from scratch every time Figma adds a feature

### Core Principles

| # | Principle | Consequence |
|---|-----------|-------------|
| 1 | **Every visual value must be a variable** | No hardcoded colors, spacing, radius, or font sizes |
| 2 | **Every optional element must be a property** | Consumers never enter the component to show/hide layers |
| 3 | **Structure mirrors the DOM** | Frame hierarchy maps 1:1 to HTML element hierarchy |
| 4 | **Variants for mutual exclusion only** | If two states can coexist, they're separate properties |
| 5 | **Layout is intrinsic** | Components adapt to content; fixed sizes are the exception |
| 6 | **States are interactive** | Hover/press/focus exist as state transitions, not separate artboards |
| 7 | **Names are semantic** | Layer names describe purpose, not appearance |

### The Competency Spectrum

```
Level 1 — Visual Fake       : Rectangle + text, looks right, does nothing
Level 2 — Static Component  : Proper frame, auto-layout, but no properties
Level 3 — Property-Rich     : Variants, booleans, text props, swaps
Level 4 — Token-Bound       : All values from variables, theme-switchable
Level 5 — Production-Grade  : Interactive states, min/max sizing, slots, scoped vars
                              ← THIS IS THE TARGET
```

---

## 2. The 15 Construction Axes

Every production Figma component must address these 15 axes. Not every component uses all 15 (a divider won't need instance swap), but the builder must **consciously decide** which apply.

| # | Axis | Category | Key Question |
|---|------|----------|--------------|
| 1 | Frame Hierarchy | Structure | How are containers nested? |
| 2 | Auto-Layout | Structure | What's the flow direction, spacing, padding? |
| 3 | Sizing Rules | Structure | Hug, fill, or fixed? Min/max constraints? |
| 4 | Layer Naming | Structure | Can a developer understand the tree without seeing the canvas? |
| 5 | Variant Properties | Properties | What mutually exclusive modes exist? |
| 6 | Boolean Properties | Properties | What optional parts can be toggled? |
| 7 | Instance Swap | Properties | What nested instances can be swapped? |
| 8 | Text Properties | Properties | What text is consumer-editable? |
| 9 | Nested Exposure | Properties | Which child properties bubble up? |
| 10 | Color Variables | Tokens | Which fills/strokes are token-bound? |
| 11 | Number Variables | Tokens | Which spacing/radius/size values are token-bound? |
| 12 | Variable Scoping | Tokens | Which properties can each variable apply to? |
| 13 | Variable Modes | Tokens | Light/dark, density, brand — what modes switch? |
| 14 | Interactive Components | Behavior | What state transitions exist? |
| 15 | Responsive | Behavior | How does it behave in different containers/breakpoints? |

---

## Axis 1: Frame Hierarchy

### Rule: Structure mirrors the DOM tree

```
WRONG (flat):
  Component
  ├── Icon
  ├── Label
  └── Background    ← Decorative layer floating separately

RIGHT (semantic nesting):
  Component
  └── .container    ← Single root frame with auto-layout
      ├── .leading-slot
      │   └── [Icon Instance]
      ├── .content
      │   ├── .label
      │   └── .description (optional)
      └── .trailing-slot
          └── [Icon Instance]
```

### Rules

| Rule | Rationale |
|------|-----------|
| Every component has exactly ONE root auto-layout frame | Predictable structure for code gen |
| Slots are wrapper frames, not bare instances | Allows boolean property on the wrapper |
| Content groups use intermediate frames when they have independent layout | Prevents spacing conflicts |
| No decorative "background" layers — use the frame's own fill | Reduces layer count, leverages auto-layout |
| Depth ≤ 4 levels for L1 components | Deeper nesting kills property exposure |

### When to Add an Intermediate Frame

| Scenario | Add frame? | Why |
|----------|-----------|-----|
| Icon + Label in a row | No | Parent auto-layout handles it |
| Label + Description stacked vertically inside a horizontal parent | **Yes** | Need vertical layout inside horizontal |
| Two icons that should hide/show independently | **Yes** | Each needs its own boolean property wrapper |
| Badge overlapping the corner | **Yes** | Needs `layoutPositioning: 'ABSOLUTE'` |

### Figma API

```javascript
// Structure creation
const container = figma.createComponent()  // or figma.createFrame() for variants
container.layoutMode = 'HORIZONTAL'
container.name = '.container'

const leadingSlot = figma.createFrame()
leadingSlot.name = '.leading-slot'
container.appendChild(leadingSlot)
```

---

## Axis 2: Auto-Layout

### Rule: Every frame that contains children uses auto-layout

No exceptions. If children are positioned, they use `layoutPositioning: 'ABSOLUTE'` inside an auto-layout parent — never a frame with `layoutMode: 'NONE'`.

### Layout Direction Decision Tree

```
Is this a row of elements? → HORIZONTAL
Is this a stack of elements? → VERTICAL
Is this a grid of equal items? → GRID (new in Figma)
Is this a wrapping tag list? → HORIZONTAL + layoutWrap: 'WRAP'
```

### Spacing & Padding Rules

| Property | CSS Equivalent | Variable Binding |
|----------|---------------|-----------------|
| `paddingTop/Bottom` | `padding-block` | `--{comp}-padding-y-{size}` |
| `paddingLeft/Right` | `padding-inline` | `--{comp}-padding-x-{size}` |
| `itemSpacing` | `gap` | `--{comp}-gap-{size}` |
| `counterAxisSpacing` | `row-gap` (when wrapped) | `--{comp}-row-gap-{size}` |

### Alignment Mapping

| CSS | Figma Primary Axis | Figma Counter Axis |
|-----|-------------------|-------------------|
| `justify-content: flex-start` | `primaryAxisAlignItems: 'MIN'` | — |
| `justify-content: center` | `primaryAxisAlignItems: 'CENTER'` | — |
| `justify-content: flex-end` | `primaryAxisAlignItems: 'MAX'` | — |
| `justify-content: space-between` | `primaryAxisAlignItems: 'SPACE_BETWEEN'` | — |
| `align-items: flex-start` | — | `counterAxisAlignItems: 'MIN'` |
| `align-items: center` | — | `counterAxisAlignItems: 'CENTER'` |
| `align-items: flex-end` | — | `counterAxisAlignItems: 'MAX'` |
| `align-items: baseline` | — | `counterAxisAlignItems: 'BASELINE'` |

### Critical: `strokesIncludedInLayout`

**Always set to `true`** for components with visible borders. This makes Figma behave like CSS `box-sizing: border-box` — the stroke doesn't add to the component's dimensions.

```javascript
container.strokesIncludedInLayout = true  // ALWAYS for bordered components
```

### Figma API

```javascript
container.layoutMode = 'HORIZONTAL'
container.paddingTop = 8
container.paddingBottom = 8
container.paddingLeft = 16
container.paddingRight = 16
container.itemSpacing = 8
container.primaryAxisAlignItems = 'CENTER'
container.counterAxisAlignItems = 'CENTER'
container.strokesIncludedInLayout = true
container.clipsContent = true
```

---

## Axis 3: Sizing Rules

### The Golden Rule of Sizing

| Element Type | Horizontal | Vertical |
|-------------|-----------|----------|
| Component root | `HUG` (intrinsic) or `FILL` (stretchy) | `HUG` |
| Label text | `HUG` or `FILL` | `HUG` |
| Icon slot | `FIXED` (square) | `FIXED` |
| Input field | `FILL` | `FIXED` or `HUG` |
| Container in a form | `FILL` | `HUG` |

### Min/Max Constraints

**Use min/max generously** — they prevent components from collapsing or exploding:

| Scenario | Constraint | Variable |
|----------|-----------|----------|
| Button shouldn't be narrower than icon-only | `minWidth` | `--btn-min-width-{size}` |
| Button shouldn't exceed container | `maxWidth` | `null` (let fill handle it) |
| Input has a fixed height per size | `minHeight` = `maxHeight` | `--input-height-{size}` |
| Avatar is always square | `lockAspectRatio()` + fixed width | `--avatar-size-{size}` |

### Sizing Shorthand (prefer these)

```javascript
// Instead of setting primaryAxisSizingMode + layoutGrow separately:
node.layoutSizingHorizontal = 'HUG'   // or 'FILL' or 'FIXED'
node.layoutSizingVertical = 'HUG'     // or 'FILL' or 'FIXED'
```

### Common Mistake: `HUG` vs `FILL` on Text

```
WRONG: Label with layoutSizingHorizontal = 'FILL'
       → Text stretches, looks weird when button is wide

RIGHT: Label with layoutSizingHorizontal = 'HUG'  (button hugs label)
       OR: Label with 'FILL' when the button ITSELF is set to fill its container
       (text centers within the available space)
```

**Decision**: If the component's primary axis is `HUG`, children should also `HUG`. If the component is `FILL` (like an input), then the main content child should `FILL`.

### Figma API

```javascript
node.layoutSizingHorizontal = 'HUG'
node.layoutSizingVertical = 'FIXED'
node.minWidth = 32
node.maxWidth = null  // no max
node.minHeight = 40
// For fixed aspect ratio:
node.lockAspectRatio()
```

---

## Axis 4: Layer Naming

### Convention: Dot-prefix for structural, PascalCase for semantic

| Layer Type | Pattern | Examples |
|-----------|---------|----------|
| Structural wrapper | `.{role}` | `.container`, `.leading-slot`, `.content-row` |
| Content element | `{Name}` | `Label`, `Description`, `Badge` |
| Icon instance | `Icon` | Swappable via instance swap property |
| State indicator | `.{indicator}` | `.focus-ring`, `.loading-spinner` |

### Why Dot-Prefix?

- Signals "this is structural, not user-facing content"
- Sorts to the top in the layers panel
- AI tools can recognize structural vs content layers
- Dev Mode shows meaningful names in code gen

### Naming Anti-Patterns

```
❌ Frame 847
❌ Rectangle 3
❌ Group 12
❌ Vector
❌ btn-bg (implementation detail)
❌ blue-rectangle (describes appearance)

✅ .container
✅ .leading-icon-slot
✅ Label
✅ .focus-ring
✅ .track (for slider/toggle)
```

---

## Axis 5: Variant Properties

### Rule: Variants are for MUTUALLY EXCLUSIVE visual modes only

A variant property creates a **combinatorial matrix** — every combination must have a physical component. Use them sparingly.

### When to Use Variants vs Other Properties

| Scenario | Use | Why |
|----------|-----|-----|
| Size (small, base, large) | **Variant** | Sizes change multiple values simultaneously (height, padding, font, icon-size) |
| Style (filled, outlined, ghost) | **Variant** | Fundamentally different surface treatment |
| State (default, hover, pressed, focused, disabled) | **Interactive Component** ← NOT a variant | States transition, they don't coexist |
| Has icon (yes/no) | **Boolean property** | Doesn't change the component's identity |
| Icon choice (search, close, arrow) | **Instance swap** | Content choice, not structural |
| Label text ("Submit", "Cancel") | **Text property** | Content, not structure |

### Variant Naming Convention

```
Component Set Name: Button
Variant Properties:
  Size = micro | tiny | small | base | medium | large | big | huge | mega | ultra
  Variant = filled | outlined | ghost

Resulting component names (auto-generated):
  "Size=base, Variant=filled"
  "Size=large, Variant=outlined"
  etc.
```

### Combinatorial Explosion Warning

```
DANGER ZONE:
  Size (10) × Variant (3) × State (5) = 150 physical components
  
CORRECT APPROACH:
  Size (10) × Variant (3) = 30 physical components
  State (5) = interactive component transitions (NOT variants)
```

### Figma API

```javascript
// Create individual components for each combination
const components = []
for (const size of sizes) {
  for (const variant of variants) {
    const comp = figma.createComponent()
    comp.name = `Size=${size}, Variant=${variant}`
    // ... build internal structure ...
    components.push(comp)
  }
}

// Combine into a component set
const componentSet = figma.combineAsVariants(components, figma.currentPage)
componentSet.name = 'Button'
```

---

## Axis 6: Boolean Properties

### Rule: Every optional visual element gets a boolean property

Boolean properties show/hide elements via the `visible` property reference. The consumer sees a toggle in the property panel.

### What Gets a Boolean Property

| Element | Property Name | Default |
|---------|--------------|---------|
| Leading icon | `Show Leading Icon` | `false` |
| Trailing icon | `Show Trailing Icon` | `false` |
| Description text | `Show Description` | `false` |
| Badge/counter | `Show Badge` | `false` |
| Loading spinner | `Loading` | `false` |
| Close button | `Dismissible` | `true` |
| Avatar | `Show Avatar` | `false` |

### Architecture: Boolean on Wrapper Frame, Not on Instance

```
WRONG:
  .container
  ├── [Icon Instance] ← Boolean on this directly
  └── Label

RIGHT:
  .container
  ├── .leading-icon-slot ← Boolean property on THIS frame's visibility
  │   └── [Icon Instance]
  └── Label
```

**Why?** If you put the boolean directly on the instance, you lose the ability to have padding/spacing that also disappears. The wrapper frame participates in auto-layout — when hidden, its space collapses.

### Figma API

```javascript
// Add boolean property to component or component set
const propName = component.addComponentProperty('Show Leading Icon', 'BOOLEAN', false)

// Wire it to the wrapper frame's visibility
leadingSlotFrame.componentPropertyReferences = { visible: propName }
```

---

## Axis 7: Instance Swap Properties

### Rule: Every swappable nested instance gets an instance swap property

Instance swap lets consumers change nested component instances (icons, avatars, badges) from the property panel without entering the component.

### What Gets an Instance Swap Property

| Slot | Property Name | Default | Preferred Values |
|------|--------------|---------|-----------------|
| Leading icon | `Leading Icon` | placeholder icon | Icon library components |
| Trailing icon | `Trailing Icon` | chevron-down | Icon library components |
| Avatar | `Avatar` | default avatar | Avatar variants |
| Status indicator | `Status` | dot component | Status dot variants |

### Preferred Values

Always set preferred values — this gives consumers a curated list in the swap dropdown instead of the entire library:

```javascript
const propName = component.addComponentProperty('Leading Icon', 'INSTANCE_SWAP', defaultIconId, {
  preferredValues: [
    { type: 'COMPONENT', key: searchIconKey },
    { type: 'COMPONENT', key: closeIconKey },
    { type: 'COMPONENT', key: arrowIconKey },
    // ... curated list
  ]
})

// Wire to the instance node
iconInstance.componentPropertyReferences = { mainComponent: propName }
```

### Slot Pattern (Icon Slot Component)

Create a tiny "slot" component that serves as the default/placeholder:

```
IconSlot (Component, 16×16)
  └── Placeholder vector (invisible or minimal)

Purpose: Gives instance swap something to swap FROM
         Preferred values tell it what to swap TO
```

---

## Axis 8: Text Properties

### Rule: Every user-facing text element gets a text property

Text properties let consumers edit text from the property panel without double-clicking into the component.

### What Gets a Text Property

| Element | Property Name | Default Value |
|---------|--------------|--------------|
| Button label | `Label` | `"Button"` |
| Input placeholder | `Placeholder` | `"Enter text..."` |
| Tooltip content | `Content` | `"Tooltip text"` |
| Badge count | `Count` | `"1"` |
| Alert title | `Title` | `"Alert title"` |
| Alert message | `Message` | `"Alert description"` |

### Figma API

```javascript
const propName = component.addComponentProperty('Label', 'TEXT', 'Button')

// Wire to the text node
labelTextNode.componentPropertyReferences = { characters: propName }
```

### Rule: Do NOT expose internal/structural text

Don't expose text that the consumer should never change:
- Abbreviations derived from the name (avatar initials)
- Unit labels that are fixed ("px", "%")
- Decorative characters

---

## Axis 9: Nested Property Exposure

### Rule: Important child component properties should bubble up

When a component contains instances of other components, their properties can be exposed at the parent level. This prevents consumers from needing to drill into nested instances.

### What to Expose

| Parent | Child | Exposed Properties |
|--------|-------|--------------------|
| Input | Icon Button (clear) | `Show Clear Button` (boolean) |
| Menu Button | Button | `Label`, `Show Leading Icon` |
| Card | Avatar | `Show Avatar`, `Avatar` (swap) |
| Alert | Icon | `Icon` (swap) |

### What NOT to Expose

- Internal state indicators (focus rings, loading spinners managed by variants)
- Structural properties (spacing, padding — these are fixed by the parent)
- Properties that would conflict with the parent's own properties

### How It Works

When you add a component property at the parent level and wire it to a child instance's `componentPropertyReferences`, the property appears at the top level. No extra API needed — it's the same mechanism as axes 6/7/8, just applied to nested instances.

---

## Axis 10: Color Variables

### Rule: EVERY color value comes from a variable binding. Zero hardcoded colors.

### What Gets Color Variable Bindings

| Node Property | CSS Equivalent | Variable Collection |
|--------------|---------------|-------------------|
| `fills[0]` | `background-color` | T1 Color Tokens or Component tokens |
| `strokes[0]` | `border-color` | T1 Color Tokens or Component tokens |
| Text `fills[0]` | `color` | T1 Color Tokens or Component tokens |
| Effect color | `box-shadow color` | T1 Color Tokens |

### Binding Hierarchy (from DTF token system)

```
Level 0 — Primitives (T0)     : Raw hex values. NEVER bind to these directly.
Level 1 — Semantic (T1)       : --primary-500, --danger-300. Bind generic surfaces here.
Level 2 — Surface Context (T2): --surface-base-bg, --surface-base-ct-default. For page-level.
Level 3 — Component (comp)    : --btn-primary-bg, --input-border-color. BIND COMPONENTS HERE.
```

**Golden rule**: Components bind to COMPONENT-LEVEL variables, not primitives or semantic tokens. This allows component-specific theming independent of the global palette.

### Per-Variant Coloring Strategy

For components with multiple variants (filled, outlined, ghost), you need variant-specific color bindings. Two approaches:

**Approach A: Variable per variant** (simpler for small variant counts)
```
--btn-filled-bg         → bound to fills[0] in "Variant=filled" component
--btn-outlined-bg       → bound to fills[0] in "Variant=outlined" component
--btn-ghost-bg          → bound to fills[0] in "Variant=ghost" component
```

**Approach B: Mode switching** (better for many variants)
Use a variable collection with modes per variant:
```
Collection: "Button Surface"
Modes: filled | outlined | ghost
Variable: btn-bg → different values per mode
```
Then set mode on the variant component: `component.setExplicitVariableModeForCollection(collection, modeId)`

### Figma API

```javascript
// Find the variable
const variables = await figma.variables.getLocalVariablesAsync('COLOR')
const bgVar = variables.find(v => v.name === 'comp/btn/primary/bg')

// Bind to a frame's fill
node.fills = [{ type: 'SOLID', color: {r:0, g:0, b:0} }]  // Initial fill required
node.setBoundVariable('fills', 0, bgVar)

// Bind to stroke
node.strokes = [{ type: 'SOLID', color: {r:0, g:0, b:0} }]
node.setBoundVariable('strokes', 0, borderVar)

// Bind to text color
textNode.fills = [{ type: 'SOLID', color: {r:0, g:0, b:0} }]
textNode.setBoundVariable('fills', 0, textColorVar)
```

---

## Axis 11: Number Variables

### Rule: All spacing, sizing, and radius values come from number variables

### What Gets Number Variable Bindings

| Property | Variable Pattern | Example |
|----------|-----------------|---------|
| `paddingTop/Bottom` | `--{comp}-padding-y-{size}` | `--btn-padding-y-base` = 8 |
| `paddingLeft/Right` | `--{comp}-padding-x-{size}` | `--btn-padding-x-base` = 16 |
| `itemSpacing` | `--{comp}-gap-{size}` | `--btn-gap-base` = 8 |
| `cornerRadius` | `--{comp}-radius-{size}` | `--btn-radius-base` = 6 |
| `width` (fixed) | `--{comp}-size-{size}` | `--avatar-size-base` = 40 |
| `height` (fixed) | `--{comp}-height-{size}` | `--btn-height-base` = 40 |
| `minWidth` | `--{comp}-min-width-{size}` | `--btn-min-width-base` = 64 |
| `strokeWeight` | `--{comp}-border-width` | `--btn-border-width` = 1 |

### Size-Per-Variant Strategy

Since each size variant is a separate physical component, you bind the size-specific variable to each:

```javascript
// For "Size=base" variant:
baseVariant.setBoundVariable('paddingTop', paddingYBaseVar)
baseVariant.setBoundVariable('paddingBottom', paddingYBaseVar)
baseVariant.setBoundVariable('paddingLeft', paddingXBaseVar)
baseVariant.setBoundVariable('paddingRight', paddingXBaseVar)
baseVariant.setBoundVariable('itemSpacing', gapBaseVar)
baseVariant.setBoundVariable('topLeftRadius', radiusBaseVar)
// ... etc for all 4 corners

// For "Size=large" variant:
largeVariant.setBoundVariable('paddingTop', paddingYLargeVar)
// ... etc
```

### Figma API

```javascript
const variables = await figma.variables.getLocalVariablesAsync('FLOAT')
const paddingVar = variables.find(v => v.name === 'comp/btn/padding-y/base')

node.setBoundVariable('paddingTop', paddingVar)
node.setBoundVariable('paddingBottom', paddingVar)
node.setBoundVariable('paddingLeft', paddingXVar)
node.setBoundVariable('paddingRight', paddingXVar)
node.setBoundVariable('itemSpacing', gapVar)
node.setBoundVariable('topLeftRadius', radiusVar)
node.setBoundVariable('topRightRadius', radiusVar)
node.setBoundVariable('bottomLeftRadius', radiusVar)
node.setBoundVariable('bottomRightRadius', radiusVar)
```

---

## Axis 12: Variable Scoping

### Rule: Restrict variables to their intended properties

Variable scoping prevents designers from accidentally binding a spacing variable to a color property, or a radius variable to a font size.

### Scoping Matrix

| Variable Purpose | Allowed Scopes |
|-----------------|---------------|
| Background color | `FILL_COLOR` |
| Border color | `STROKE_COLOR` |
| Text color | `FILL_COLOR` (on text nodes) |
| Spacing (padding, gap) | `GAP` |
| Border radius | `CORNER_RADIUS` |
| Border width | `STROKE_FLOAT` |
| Component height | `HEIGHT` |
| Component width | `WIDTH` |
| Font size | `FONT_SIZE` |
| Font weight | `FONT_WEIGHT` |
| Line height | `LINE_HEIGHT` |
| Letter spacing | `LETTER_SPACING` |
| Opacity | `OPACITY` |
| Effect radius (blur, shadow) | `EFFECT_FLOAT` |

### Figma API

```javascript
// When creating variables, set their scopes:
variable.scopes = ['FILL_COLOR']  // For a background color variable
variable.scopes = ['GAP']         // For a spacing variable
variable.scopes = ['CORNER_RADIUS'] // For a radius variable
variable.scopes = ['WIDTH', 'HEIGHT'] // For a sizing variable
```

---

## Axis 13: Variable Modes

### Rule: Use modes for systematic variations that affect ALL tokens simultaneously

### When to Use Modes vs Separate Variables

| Scenario | Solution | Why |
|----------|----------|-----|
| Light/Dark theme | **Modes** on color collection | All colors switch at once |
| Density (compact/default/comfortable) | **Modes** on sizing collection | All spacing switches at once |
| Brand (Acme/Globex) | **Modes** on color collection | All brand colors switch |
| Component size (micro→ultra) | **Separate variables per size** | Sizes coexist in one design |

### DTF's 6 Collections → Mode Strategy

| Collection | Modes | Used For |
|-----------|-------|----------|
| T0 Primitive Colors | 1 (no modes) | Raw palette |
| T1 Color Tokens | Light, Dark | Theme switching |
| T2 Surface Context | 9 surface modes | Contextual backgrounds |
| T3 Status Context | 6 semantic role modes | Component semantic colors |
| Primitives Numbers | 1 (no modes) | Raw spacing/sizing values |
| Component Sizes | 10 density modes | Per-size token sets |

### Applying Modes to Components

```javascript
// Set a frame to use Dark mode for T1 collection:
frame.setExplicitVariableModeForCollection(t1Collection, darkModeId)

// Set a component variant to use a specific size mode:
baseVariant.setExplicitVariableModeForCollection(sizeCollection, baseModeId)
```

---

## Axis 14: Interactive Components

### Rule: States are transitions, not variants

Interactive components define a STATE MACHINE where user interactions trigger transitions between states. This is fundamentally different from variants — states don't coexist, they flow.

### The State Machine

```
                    MOUSE_ENTER
     ┌─────────────────────────────────┐
     │                                 ▼
  DEFAULT ─────────────────────────→ HOVER
     ▲                                 │
     │              MOUSE_DOWN         ▼
     │                            PRESSED
     │                                 │
     │              MOUSE_UP           │
     └─────────────────────────────────┘
     
     FOCUS (parallel track):
     DEFAULT ──TAB──→ FOCUSED ──TAB──→ DEFAULT
     
     DISABLED (terminal):
     No interactions. Component is inert.
```

### Implementation: One Component Per State

Each state IS a variant of the component, but wired with interactions instead of exposed as a property:

```
Button (Component Set)
├── Size=base, Variant=filled, State=default  ← exposed to user
├── Size=base, Variant=filled, State=hover    ← HIDDEN from user
├── Size=base, Variant=filled, State=pressed  ← HIDDEN from user  
├── Size=base, Variant=filled, State=focused  ← HIDDEN from user
└── Size=base, Variant=filled, State=disabled ← exposed to user (or boolean)
```

**Key insight**: State variants are hidden from the component property panel. They exist only for the interactive component state machine. Only "default" and optionally "disabled" are visible to consumers.

### Reactions (Transitions)

```javascript
// On the DEFAULT variant:
defaultVariant.reactions = [
  {
    trigger: { type: 'ON_HOVER' },
    actions: [
      {
        type: 'NODE',
        destinationId: hoverVariant.id,
        navigation: 'SWAP_STATE',
        transition: { type: 'DISSOLVE', duration: 0.15 }
      }
    ]
  }
]

// On the HOVER variant:
hoverVariant.reactions = [
  {
    trigger: { type: 'ON_PRESS' },
    actions: [
      {
        type: 'NODE',
        destinationId: pressedVariant.id,
        navigation: 'SWAP_STATE',
        transition: { type: 'DISSOLVE', duration: 0.05 }
      }
    ]
  },
  {
    trigger: { type: 'MOUSE_LEAVE' },
    actions: [
      {
        type: 'NODE',
        destinationId: defaultVariant.id,
        navigation: 'SWAP_STATE',
        transition: { type: 'DISSOLVE', duration: 0.15 }
      }
    ]
  }
]
```

### Which States to Implement

| Component | States |
|-----------|--------|
| Button | default, hover, pressed, focused, disabled, loading |
| Input | default, hover, focused, filled, error, disabled |
| Checkbox | unchecked, checked, indeterminate (× hover/focused/disabled) |
| Toggle | off, on (× hover/focused/disabled) |
| Select | default, hover, focused, open, disabled |

---

## Axis 15: Responsive & Constraints

### Rule: Components should work in any container without manual adjustment

### Sizing Behavior Matrix

| Context | Component Should |
|---------|-----------------|
| Inside a fixed-width frame | Fill the width (if `layoutSizingHorizontal = 'FILL'`) |
| Inside a hug-content frame | Size to its own content |
| Narrow container | Respect `minWidth`, truncate text with "..." |
| Very wide container | Respect `maxWidth` or stretch gracefully |
| Mobile (375px viewport) | Same component, different density mode |

### Auto-Layout Wrap for Responsive Patterns

```javascript
// Tag list that wraps when container is narrow:
tagContainer.layoutMode = 'HORIZONTAL'
tagContainer.layoutWrap = 'WRAP'
tagContainer.counterAxisSpacing = 8  // gap between rows
```

### Grid Layout Mode

For components with grid-based internal layout (calendar, color picker):

```javascript
calendarGrid.layoutMode = 'GRID'
calendarGrid.gridColumnCount = 7
calendarGrid.gridRowCount = 6
calendarGrid.gridRowGap = 4
calendarGrid.gridColumnGap = 4
```

---

## 3. Decision Framework

When building a component, walk through this checklist:

### Step 1: Define the Variant Matrix

```
Q: What mutually exclusive modes exist?
   → These become VARIANT properties
   → Count combinations — keep under 50 physical components

Q: How many sizes?
   → DTF: 10 (micro→ultra) for all10, 3/6 for others
   → Each size is a variant value
```

### Step 2: Identify Optional Elements

```
Q: What can be shown/hidden?
   → Each gets a BOOLEAN property
   → Wrap each in a frame for clean show/hide

Q: What can be swapped?
   → Each gets an INSTANCE_SWAP property
   → Create preferred values list

Q: What text is editable?
   → Each gets a TEXT property
```

### Step 3: Map Token Bindings

```
Q: What colors change per variant? per state? per theme?
   → Map to color variables with appropriate modes

Q: What dimensions change per size?
   → Map to number variables (one per size, or one collection with size modes)

Q: What radius/border values are shared vs per-component?
   → Global tokens for shared, component tokens for specific
```

### Step 4: Define State Machine

```
Q: What interaction states exist?
   → Create hidden variant for each state
   → Wire reactions (triggers + transitions)
   → Duration: 0.15s for hover, 0.05s for press, 0.2s for focus
```

### Step 5: Validate

```
□ Can a consumer use this without entering the component? (properties complete)
□ Does it work in light AND dark mode? (color variables have both modes)
□ Does it work at all sizes? (sizing variables bound)
□ Can it stretch/shrink with its container? (sizing rules correct)
□ Is it prototype-ready? (interactive states wired)
□ Does Dev Mode show meaningful names? (layer naming correct)
□ Are all values tokenized? (no hardcoded colors/spacing/radius)
```

---

## 4. Anti-Patterns

### ❌ The Flat Fake

```
Problem: Component is just visual — rectangles with applied colors, no auto-layout
Impact: Breaks on any content change, impossible to theme, useless for prototyping
Fix: Rebuild with proper frame hierarchy + auto-layout
```

### ❌ The Variant Explosion

```
Problem: States modeled as variants → 10 sizes × 3 variants × 5 states = 150 components
Impact: Unmanageable, slow, fills assets panel
Fix: Use interactive components for states, reduce to 30 physical components
```

### ❌ The Style Orphan

```
Problem: Colors applied as raw hex or linked to Styles instead of Variables
Impact: Can't switch themes, can't scope, can't mode-switch
Fix: Migrate all color/number values to variable bindings
```

### ❌ The Property Desert

```
Problem: Component looks right but has zero properties — consumer must enter it to change anything
Impact: Defeats the purpose of components, terrible UX in the assets panel
Fix: Add boolean/text/swap properties for every consumer-facing element
```

### ❌ The Fixed Dimension

```
Problem: Component has hard-coded width/height, can't adapt to content or container
Impact: Designers manually resize, creating detached instances
Fix: Use HUG/FILL with min/max constraints
```

### ❌ The Nested Maze

```
Problem: 8+ levels of nesting, properties can't be exposed
Impact: Consumers can't access child properties, Dev Mode shows confusing tree
Fix: Flatten to max 4 levels, expose important child props at parent
```

### ❌ The Unnamed Layers

```
Problem: Layers named "Frame 847", "Rectangle 3", "Group 12"
Impact: Dev Mode generates garbage, designers can't navigate layers panel
Fix: Name EVERY layer semantically before publishing
```

### ❌ The Unscoped Variable

```
Problem: Variables can be applied to any property (spacing var on a color field)
Impact: Designers make mistakes, color picker shows irrelevant variables
Fix: Set scopes on every variable: FILL_COLOR, GAP, CORNER_RADIUS, etc.
```

---

## 5. CSS ↔ Figma Mapping Table

### Layout

| CSS | Figma Property | Notes |
|-----|---------------|-------|
| `display: flex` | `layoutMode: 'HORIZONTAL'` or `'VERTICAL'` | |
| `display: grid` | `layoutMode: 'GRID'` | New, not all features parity |
| `flex-direction: row` | `layoutMode: 'HORIZONTAL'` | |
| `flex-direction: column` | `layoutMode: 'VERTICAL'` | |
| `flex-wrap: wrap` | `layoutWrap: 'WRAP'` | |
| `gap` | `itemSpacing` | Single value only |
| `row-gap` (wrap) | `counterAxisSpacing` | Only when wrapped |
| `padding` | `paddingTop/Right/Bottom/Left` | Individual sides |
| `justify-content` | `primaryAxisAlignItems` | See alignment table above |
| `align-items` | `counterAxisAlignItems` | See alignment table above |
| `box-sizing: border-box` | `strokesIncludedInLayout: true` | |
| `overflow: hidden` | `clipsContent: true` | |
| `position: absolute` | `layoutPositioning: 'ABSOLUTE'` | Child within auto-layout |

### Sizing

| CSS | Figma Property | Notes |
|-----|---------------|-------|
| `width: auto` / intrinsic | `layoutSizingHorizontal: 'HUG'` | |
| `width: 100%` / stretch | `layoutSizingHorizontal: 'FILL'` | |
| `width: 200px` | `layoutSizingHorizontal: 'FIXED'` + `resize(200, h)` | |
| `min-width` | `minWidth` | |
| `max-width` | `maxWidth` | |
| `height: auto` | `layoutSizingVertical: 'HUG'` | |
| `flex-grow: 1` | `layoutGrow: 1` | Stretch along primary axis |
| `align-self: stretch` | `layoutAlign: 'STRETCH'` | Stretch along counter axis |

### Visual

| CSS | Figma Property | Notes |
|-----|---------------|-------|
| `background-color` | `fills[0]` (solid paint) | Bind to COLOR variable |
| `border-color` | `strokes[0]` (solid paint) | Bind to COLOR variable |
| `border-width` | `strokeWeight` | Bind to FLOAT variable |
| `border-style: solid` | Default (always solid unless `dashPattern`) | |
| `border-style: dashed` | `dashPattern: [4, 4]` | |
| `border-radius` | `cornerRadius` | Or individual corners |
| `border-radius` (iOS smooth) | `cornerSmoothing: 0.6` | iOS squircle |
| `opacity` | `opacity` | |
| `box-shadow` | `effects: [{ type: 'DROP_SHADOW', ... }]` | |
| `color` (text) | Text node `fills[0]` | |
| `font-size` | `fontSize` (on text node) | Bind to FLOAT variable |
| `font-weight` | `fontWeight` (on text node) | |
| `line-height` | `lineHeight` (on text node) | |
| `letter-spacing` | `letterSpacing` (on text node) | |
| `text-overflow: ellipsis` | `textTruncation: 'ENDING'` | |

### Component Model

| HTML/CSS Pattern | Figma Feature | Notes |
|-----------------|---------------|-------|
| `data-variant="filled"` | Variant property | Mutually exclusive modes |
| `data-size="large"` | Variant property | Size dimension |
| `data-disabled` | Variant or boolean prop | If affects all visuals → variant; if just grays out → boolean |
| Optional child element | Boolean property | Show/hide with property |
| `<slot>` / `{children}` | Slot property (`'SLOT'` type) | New! Replaces frame content |
| CSS custom property | Figma Variable | Bound via `setBoundVariable` |
| `:hover` / `:active` | Interactive component reactions | State machine transitions |
| `@media` breakpoint | Explicit mode override or separate component | No native responsive in Figma |
| CSS `transition` | Figma transition on reaction | `DISSOLVE`, `SMART_ANIMATE` |

---

## 6. Component Complexity Tiers

Not every component needs all 15 axes. Use this tier system to determine the appropriate level of construction:

### Tier 1: Simple (3-5 axes)

**Examples**: Divider, Badge, Dot indicator

| Required Axes | Optional |
|--------------|----------|
| Frame Hierarchy, Auto-Layout, Color Variables | Sizing Rules, Number Variables |

### Tier 2: Standard (8-10 axes)

**Examples**: Button, Input, Checkbox, Toggle, Avatar

| Required Axes | Optional |
|--------------|----------|
| All of Tier 1 + Variant Properties, Boolean Properties, Instance Swap, Text Properties, Number Variables, Interactive Components | Variable Scoping, Responsive |

### Tier 3: Complex (12-15 axes)

**Examples**: Datepicker, Select (with dropdown), File Upload, Editor

| Required Axes | All 15 apply |
|--------------|----------|
| Everything. Multiple nested component instances, slots, overlay prototyping, grid layout, wrap behavior. | |

---

## 7. Plugin API Reference Map

Quick reference for the key API calls per axis:

| Axis | Primary API | Secondary API |
|------|------------|---------------|
| 1. Frame Hierarchy | `figma.createComponent()`, `parent.appendChild(child)` | `figma.createFrame()` |
| 2. Auto-Layout | `.layoutMode`, `.paddingX`, `.itemSpacing` | `.primaryAxisAlignItems`, `.counterAxisAlignItems` |
| 3. Sizing | `.layoutSizingHorizontal`, `.minWidth`, `.maxWidth` | `.resize()`, `.lockAspectRatio()` |
| 4. Naming | `.name = '.container'` | |
| 5. Variants | `figma.combineAsVariants(components, parent)` | Component `.name` format `"Prop=value, Prop=value"` |
| 6. Boolean | `.addComponentProperty(name, 'BOOLEAN', default)` | `.componentPropertyReferences = { visible: propId }` |
| 7. Instance Swap | `.addComponentProperty(name, 'INSTANCE_SWAP', defaultId, {preferredValues})` | `.componentPropertyReferences = { mainComponent: propId }` |
| 8. Text | `.addComponentProperty(name, 'TEXT', default)` | `.componentPropertyReferences = { characters: propId }` |
| 9. Nested Exposure | Same as 6/7/8 but targeting nested instance sublayers | |
| 10. Color Variables | `.setBoundVariable('fills', 0, variable)` | `.setBoundVariable('strokes', 0, variable)` |
| 11. Number Variables | `.setBoundVariable('paddingTop', variable)` | `.setBoundVariable('itemSpacing', variable)`, `.setBoundVariable('topLeftRadius', variable)` |
| 12. Scoping | `variable.scopes = ['FILL_COLOR']` | |
| 13. Modes | `.setExplicitVariableModeForCollection(collection, modeId)` | |
| 14. Interactive | `.reactions = [{ trigger, actions }]` | `navigation: 'SWAP_STATE'` |
| 15. Responsive | `.layoutWrap`, `.layoutMode = 'GRID'`, `.constraints` | `.minWidth`, `.maxWidth` |

---

## 8. Future-Proofing Strategy

### The Abstract Spec Layer

Define components in a **platform-agnostic spec** that maps to Figma's current API. When Figma adds features, update the mapping — not the specs.

```yaml
# Abstract spec (stable)
component: Button
structure:
  root:
    layout: horizontal
    children:
      - slot: leading-icon
        optional: true
        swappable: true
      - element: label
        editable: true
      - slot: trailing-icon
        optional: true
        swappable: true

# Figma mapping (versioned, updatable)
figma_api_version: "2026.05"
mappings:
  layout.horizontal: { layoutMode: 'HORIZONTAL' }
  slot.optional: { addComponentProperty: ['BOOLEAN', false] }
  slot.swappable: { addComponentProperty: ['INSTANCE_SWAP', defaultId] }
  element.editable: { addComponentProperty: ['TEXT', defaultValue] }
```

### When Figma Adds New Features

| Figma Addition | Impact on This Standard |
|----------------|------------------------|
| New component property type (e.g., NUMBER) | Add to Axis 5-9, update API map |
| New layout mode (e.g., MASONRY) | Add to Axis 2, update CSS mapping |
| Responsive breakpoints (native) | Add to Axis 15, major update |
| Conditional visibility rules | May replace some boolean property patterns |
| AI-powered adaptive components | New axis or sub-axis |
| Variable binding to new properties | Update Axis 11/12 with new bindable fields |

### Monitoring for Changes

Track these sources for API changes:
- `@figma/plugin-typings` npm package (check for new `VariableBindableNodeField` values)
- Figma release notes (monthly)
- Figma community forum → Plugin API category
- `ComponentPropertyType` type definition (currently: `'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' | 'VARIANT' | 'SLOT'`)

---

## 9. Worked Example: Button

### The Complete Button Construction

Here's how all 15 axes come together for a production-grade Button component:

```
COMPONENT SET: Button
├── Physical variants: 10 sizes × 3 styles × 5 states = 150 components
│   (BUT: states are hidden from panel → only 30 visible)
│
├── AXIS 1 — Frame Hierarchy:
│   ComponentNode (root)
│   └── .container [auto-layout horizontal]
│       ├── .leading-icon-slot [frame, 16×16 fixed]
│       │   └── Icon [instance]
│       ├── Label [text node]
│       └── .trailing-icon-slot [frame, 16×16 fixed]
│           └── Icon [instance]
│
├── AXIS 2 — Auto-Layout:
│   .container: HORIZONTAL, CENTER/CENTER, itemSpacing=var, padding=var
│   strokesIncludedInLayout: true
│   clipsContent: true
│
├── AXIS 3 — Sizing:
│   .container: layoutSizingHorizontal=HUG, layoutSizingVertical=FIXED
│   minWidth bound to --btn-min-width-{size}
│   height bound to --btn-height-{size}
│   .leading-icon-slot: FIXED 16×16 (or var)
│   Label: layoutSizingHorizontal=HUG
│
├── AXIS 4 — Layer Naming:
│   .container, .leading-icon-slot, .trailing-icon-slot, Label, Icon
│
├── AXIS 5 — Variant Properties:
│   Size: micro|tiny|small|base|medium|large|big|huge|mega|ultra
│   Variant: filled|outlined|ghost
│   State: default|hover|pressed|focused|disabled (HIDDEN from panel)
│
├── AXIS 6 — Boolean Properties:
│   "Show Leading Icon" → .leading-icon-slot.visible (default: false)
│   "Show Trailing Icon" → .trailing-icon-slot.visible (default: false)
│   "Loading" → shows spinner, disables interactions (default: false)
│
├── AXIS 7 — Instance Swap Properties:
│   "Leading Icon" → Icon instance in .leading-icon-slot
│   "Trailing Icon" → Icon instance in .trailing-icon-slot
│   preferredValues: [search, close, arrow-right, plus, download...]
│
├── AXIS 8 — Text Properties:
│   "Label" → Label text node (default: "Button")
│
├── AXIS 9 — Nested Exposure:
│   Icon component's internal properties are NOT exposed (too low-level)
│
├── AXIS 10 — Color Variables:
│   .container fills[0] → --btn-{variant}-bg[-{state}]
│   .container strokes[0] → --btn-{variant}-border[-{state}]
│   Label fills[0] → --btn-{variant}-fg[-{state}]
│   Icon fills[0] → --btn-{variant}-icon-color[-{state}]
│
├── AXIS 11 — Number Variables:
│   .container paddingTop/Bottom → --btn-padding-y-{size}
│   .container paddingLeft/Right → --btn-padding-x-{size}
│   .container itemSpacing → --btn-gap-{size}
│   .container cornerRadius → --btn-radius-{size}
│   .container minWidth → --btn-min-width-{size}
│   .container height → --btn-height-{size}
│   .container strokeWeight → --btn-border-width
│   Label fontSize → --btn-font-size-{size}
│   Icon width/height → --btn-icon-size-{size}
│
├── AXIS 12 — Variable Scoping:
│   --btn-*-bg: scopes=['FILL_COLOR']
│   --btn-*-border: scopes=['STROKE_COLOR']
│   --btn-padding-*: scopes=['GAP']
│   --btn-radius-*: scopes=['CORNER_RADIUS']
│   --btn-height-*: scopes=['HEIGHT']
│
├── AXIS 13 — Variable Modes:
│   Color variables: Light mode + Dark mode (via T1 collection)
│   Size variables: 10 density modes (via comp-size collection)
│
├── AXIS 14 — Interactive Components:
│   default → hover: ON_HOVER, DISSOLVE 150ms
│   hover → pressed: ON_PRESS, DISSOLVE 50ms
│   pressed → hover: ON_CLICK (release), DISSOLVE 50ms
│   hover → default: MOUSE_LEAVE, DISSOLVE 150ms
│   any → focused: ON_FOCUS, DISSOLVE 100ms
│   focused → default: ON_BLUR, DISSOLVE 100ms
│   disabled: no reactions (inert)
│
└── AXIS 15 — Responsive:
    .container supports FILL (stretches in parent) or HUG (intrinsic)
    Label truncates with textTruncation: 'ENDING' when space is limited
    minWidth prevents collapse below icon-only size
```

### Variable Count for Button

| Axis | Variables | Per... |
|------|-----------|--------|
| Shape | 19 | 10 radius + 4 border + shadow + overflow |
| Dimension | 62 | 10× (height, px, py, min-width, gap, icon-size) + 2 |
| Surface | 120 | 10 variants × 12 properties |
| Typography | 15 | 10 font-sizes + family + weight + lh + ls + transform |
| Slots | 14 | Icon sizes + colors + loader |
| Motion | 5 | Property + duration + easing + enter + exit |
| A11y | 4 | Focus ring width/color/offset + tap target |
| **Total** | **239** | |

---

## Appendix A: VariableBindableNodeField (Complete List)

Fields you can bind variables to via `setBoundVariable()`:

### Node-level fields
- `fills` (color)
- `strokes` (color)
- `effects` (color within effects)
- `opacity` (number)
- `layoutGrids` (color within grids)

### Auto-layout fields
- `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`
- `itemSpacing`
- `counterAxisSpacing`

### Sizing fields
- `width`, `height`
- `minWidth`, `maxWidth`
- `minHeight`, `maxHeight`

### Corner fields
- `topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius`

### Stroke fields
- `strokeWeight`
- `strokeTopWeight`, `strokeRightWeight`, `strokeBottomWeight`, `strokeLeftWeight`

### Text fields (VariableBindableTextField)
- `fontFamily`
- `fontSize`
- `fontStyle`
- `fontWeight`
- `letterSpacing`
- `lineHeight`
- `paragraphSpacing`
- `paragraphIndent`

---

## Appendix B: ComponentPropertyType Values

| Type | Default Value Type | Use Case |
|------|-------------------|----------|
| `'VARIANT'` | string (variant option) | Mutually exclusive visual modes |
| `'BOOLEAN'` | boolean | Show/hide optional elements |
| `'INSTANCE_SWAP'` | string (component node ID) | Swap nested instances |
| `'TEXT'` | string | Editable text content |
| `'SLOT'` | string (frame node ID) | Replaceable frame content (new) |

---

## Appendix C: Slot Properties (New Feature)

Slot properties (`'SLOT'` type) are newer than instance swap. They allow an entire frame's **content** to be replaced, not just a single instance. Use for:

- Card content areas (any arrangement of children)
- Custom content sections
- Layout slots where the consumer provides arbitrary structure

```javascript
// Create a slot
const slot = component.createSlot()
slot.name = 'Content'

// Or add as a property on a frame
const propName = component.addComponentProperty('Content Slot', 'SLOT', frameId, {
  description: 'Replace this area with custom content'
})
```

---

## Appendix D: Checklist for Component Readiness

Print this. Check every box before publishing.

### Structure
- [ ] Single root auto-layout frame
- [ ] All children use auto-layout (no `layoutMode: 'NONE'` frames with positioned children)
- [ ] Depth ≤ 4 levels
- [ ] `strokesIncludedInLayout: true` (if bordered)
- [ ] `clipsContent: true` (unless intentional overflow)

### Properties
- [ ] Every optional element has a boolean property
- [ ] Every swappable instance has an instance swap property with preferred values
- [ ] Every user-facing text has a text property
- [ ] Variant properties cover size + style (not state)
- [ ] No more than 3 variant dimensions (size × style × [one more])
- [ ] Physical variant count ≤ 50

### Tokens
- [ ] Zero hardcoded colors — all bound to variables
- [ ] Zero hardcoded spacing/radius — all bound to variables
- [ ] Variables have correct scopes set
- [ ] Light and Dark modes work (test by switching collection mode)
- [ ] All size variants bind to their respective size variables

### Behavior
- [ ] Interactive component states defined (hover, pressed, focused, disabled)
- [ ] Transitions use appropriate duration (150ms hover, 50ms press, 100ms focus)
- [ ] Disabled state has no reactions
- [ ] State variants are hidden from the property panel

### Naming
- [ ] Every layer has a semantic name (no "Frame 847")
- [ ] Structural layers use `.dot-prefix`
- [ ] Content layers use `PascalCase`
- [ ] Component set name matches code component name

### Sizing
- [ ] HUG/FILL decisions are intentional and documented
- [ ] minWidth prevents collapse
- [ ] maxWidth prevents explosion (where applicable)
- [ ] Component works when placed in a FILL container
- [ ] Component works when placed in a HUG container
- [ ] Text truncates gracefully (textTruncation set)

### Documentation
- [ ] Component description filled in (`descriptionMarkdown`)
- [ ] Documentation link to code component added (`documentationLinks`)
- [ ] Dev resources linked (`addDevResourceAsync`)

---

*End of Document*
