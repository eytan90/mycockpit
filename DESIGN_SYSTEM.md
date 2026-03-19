# MyCockpit — iOS 26 Design System

## Core Philosophy
Content-first layout. Strong visual hierarchy. Chrome (navigation) floats above content using Liquid Glass. Content itself uses clean grouped sections — NOT frosted glass everywhere.

Apple's direction: hierarchy, harmony, consistency, Liquid Glass materials for navigation/chrome only.

---

## The 10 Rules

### 1. Hierarchy over tiles
- Reserve large cards only for truly important content
- Most info lives in grouped list rows, inset sections, or lighter surfaces
- One clear primary focus area, secondary sections below
- Avoid equally-weighted tile grids

### 2. Content edge-to-edge, chrome floats above
- Page background breathes edge-to-edge
- Translucent/material top bar and tab bar
- Floating or inset controls, not thick bordered containers
- Content lives on the screen, navigation layers above it

### 3. Liquid Glass only in the right places
- Apply glass ONLY to: top bar, tab bar, floating controls, overlays, chips, sidebars
- Do NOT apply glass blur to every content card
- Keep primary content surfaces clean and readable
- Blur, translucency, and highlights used subtly in chrome

### 4. Typography: San Francisco hierarchy
Scale (adapts to size tokens):
- Large Title: 34px bold — greeting, page title
- Title 2: 22px bold — mode headings
- Title 3: 20px semibold — major sections
- Headline: 17px semibold — row titles
- Body: 17px regular — content
- Subhead: 15px regular — metadata
- Footnote: 13px regular — secondary detail
- Caption: 11–12px — labels, timestamps

Rules:
- Use fewer sizes, used consistently
- Prefer semibold/regular hierarchy over constant bold
- Reduce all-caps uppercase tracking; use sparingly for section labels only
- Font stack: -apple-system, BlinkMacSystemFont, SF Pro Display, SF Pro Text, system-ui

### 5. SF Symbols style icons
- Use simple, consistent line icons matching SF Symbols aesthetic
- Match stroke weight to text weight context
- Filled variant only for active/selected state
- Keep icons understated, not oversized or decorative
- Weight: 1.7–1.8px strokeWidth, 17–22px size

### 6. Native tab bar (4–5 items max)
- Short labels (one word)
- True material/translucent background with blur
- Selected state: system blue tint only
- Correct safe-area padding on iPhone
- No custom borders or heavy backgrounds

### 7. iOS semantic colors (dark mode)
System backgrounds:
- bg-base: #000000
- bg-surface: #1C1C1E (systemBackground elevated)
- bg-secondary: #2C2C2E (secondarySystemBackground)
- bg-tertiary: #3A3A3C (tertiarySystemBackground)

Labels:
- text-primary: #FFFFFF
- text-secondary: #8E8E93 (systemGray)
- text-muted: #636366 (systemGray2)

System colors:
- accent-blue: #0A84FF
- accent-green: #30D158
- accent-red: #FF453A
- accent-amber: #FF9F0A
- accent-purple: #BF5AF2
- accent-teal: #5AC8FA

Separator: rgba(60,60,67,0.36)

### 8. Accessibility
- Small text: minimum 4.5:1 contrast
- Use shape + icon + label in addition to color for status
- Avoid muted purple-gray text for important content
- Status pills must be readable in dark mode

### 9. Grouped lists over heavy cards
- Replace stat tile grids with inset grouped sections or compact summary strips
- Tappable rows with drill-down affordances (chevron)
- Design for thumb reach: primary actions at bottom half of screen
- Touch targets: minimum 44pt (min-h-[52px] for rows)

### 10. Spacing rhythm (4/8pt grid)
- Outer page margin: 16px mobile, 24px desktop
- Section vertical spacing: 32px between sections
- Row internal padding: 11px vertical, 16px horizontal
- Corner radius: 12px for sections, 10px for controls, 8px for chips
- No decorative divider lines in page chrome
- Hairline separators (0.5px) between rows only
- Strong alignment, consistent grid

---

## Component Patterns

### .ios-grouped — Grouped inset section
```css
background: rgba(28,28,30,0.55);
border-radius: 12px;
overflow: hidden;
```

### .ios-row — Standard list row
```css
min-height: 52px;
padding: 11px 16px;
display: flex;
align-items: center;
border-top: 0.5px solid rgba(60,60,67,0.36); /* except first row */
```

### .glass — Liquid Glass chrome
```css
background: rgba(18,18,20,0.82);
backdrop-filter: blur(32px) saturate(2);
border: 1px solid rgba(255,255,255,0.07);
```

### Section label
```
13px, font-medium, text-secondary, pl-4, mb-1.5, uppercase tracking-wide
```

### Summary pill (compact stat)
```
Horizontal scroll strip. Each pill: rounded-full, glass-light bg, 32px height.
Color-coded value + short label.
```

---

## What to Avoid
- Generic web dashboard look
- 2×2 grids of equally weighted metric tiles
- Heavy opaque rounded rectangles for every container
- Frosted glass on content cards
- Neon accent colors without semantic meaning
- Decorative divider lines in page chrome
- Typography that feels like a landing page
- Custom iconography that doesn't match SF Symbols aesthetic
- Oversized or decorative icons
- Borders on content containers (use background contrast instead)
