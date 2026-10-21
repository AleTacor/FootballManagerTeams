---
name: ui-design
description: UI design rules for the FootballManagerTeams app (FM26 squad/team management). Use when building or changing any screen, component, style, theme, table, formation/pitch view or player card, or when asked to improve, polish or review the UI.
---

# UI design — FootballManagerTeams

This app manages squads for Football Manager 26. People who use it are FM players: they read
large, number-heavy tables quickly and expect an interface that feels like the game's tactics
screen or a scouting tool, not a marketing site. Every UI change should make squad data
**faster to scan and compare**.

## Stack and where things live

- **Vite + React 19 + TypeScript**, plain CSS. No UI kit, no icon package, no DnD library.
- `src/styles/tokens.css`: **all** colours, spacing, sizes and type (dark theme only).
  `src/styles/app.css`: component styles that use only tokens.
- `src/domain/`: types, pitch slots (`positions.ts`), FM26 roles per position and phase
  (`roles.ts`), lineup rules as pure functions (`logic.ts`). UI never re-implements lineup rules.
- `src/i18n/strings.ts`: every visible string, in `es` and `en`. Position labels and
  familiarity names also live there.
- `src/components/`: `Pitch`, `SlotPanel` (side panel / bottom sheet), `SquadList`, `PlayerEditor`,
  `PositionPicker`, `RoleSelect`, `Modal`/`ConfirmDialog`, `Sheet`, `Icon`, `FamDot`, `dnd.tsx`.
- State: `useStore()` (`updateTeam(fn)` records undo; `setSettings` doesn't). Persisted to
  `localStorage` (`fm-teams:v1`). Imports are validated in `state/storage.ts` and never trusted.

## Workflow for any UI task

1. **Read `tokens.css` and the component you touch first.** Reuse tokens and existing classes
   (`.btn`, `.icon-btn`, `.segmented/.seg`, `.input`, `.pos-badge`, `.tier-chip`, `.phase-chip`,
   `.fam-dot`, `.count`, `.empty`). Add a token before adding a raw value.
2. **Decide what the user compares on this screen** ("who covers DF (C) if my starter is out",
   "which centre-back has the best Positioning + Pace") and make that comparison take one glance.
3. **Add every new string to both languages** in `strings.ts`. Never hard-code text in JSX.
4. Build and test with real-looking data: the example squad (25 fictional players, long names,
   players without roles, subs in positions the XI doesn't use). Use **Load example squad**.
   Never test with 3 tidy rows.
5. Check a 390px phone and a 1280–1366px laptop, Spanish and English,
   and keyboard-only use.
6. Run the checklist at the end.

## Core tokens (see tokens.css for the full set)

```css
--bg #0f1419  --surface #161d24  --surface-2 #1e2730  --surface-3 #26313c
--border #2a3540  --text #e6edf3  --text-muted #9aa7b4
--accent #3fb68b (pitch green: primary action, selection)  --danger #e5534b  --warning #d4a72c  --info #4a9eda
spacing --s1 4 / --s2 8 / --s3 12 / --s4 16 / --s6 24 / --s8 32   --radius 6  --radius-lg 10
type --font-ui Inter/system-ui; --fs-xs 12 / --fs-sm 13 / --fs-md 14 / --fs-lg 16 / --fs-xl 20
controls --control-h 36   motion --fast 140ms, --ease
```

The app has **only a dark theme** (FM players use dark UIs for long sessions; the light theme
was removed at the user's request, don't bring it back). `lang` is set on `<html>`. Never write
raw hex values or one-off pixel values in components. Use a token, or add a new one to
`tokens.css`.

## Football conventions

**Phases.** Every lineup exists twice: *In possession* (Con balón, short CB/IP) and *Out of
possession* (Sin balón, SB/OOP). Positions are stored per phase but edited as one list (the player editor has no phase
switch; FM26 positions don't depend on the phase). Always label
which phase a value belongs to (`.phase-chip`, with the full phase name as its `title`).

**Position familiarity (FM dots).** These colours are fixed, set via `data-fam` on any
element that uses `var(--fam)`:

| Level        | ES               | token                |
|--------------|------------------|----------------------|
| natural      | Natural          | `--fam-natural`      |
| accomplished | Experto          | `--fam-accomplished` |
| competent    | Competente       | `--fam-competent`    |
| unconvincing | Poco convincente | `--fam-unconvincing` |
| awkward      | Torpe            | `--fam-awkward`      |
| ineffectual  | Ineficaz         | `--fam-ineffectual`  |
| unknown      | Desconocido      | `--fam-unknown` (hollow ring) |

A player in a slot he can't play gets a dotted grey ring (`data-fam="none"`). Always pair the
colour with text, a title or `sr-only` text. Sort candidate lists by familiarity, then by name.

**Position groups** (`data-group` gives `--group`): GK `--pos-gk`, D/WB `--pos-def`,
DM/M `--pos-mid`, AM/ST `--pos-att`. `.pos-badge` uses `--fs-xs`, semibold, a ~15% tinted
background, the group colour as text, and the familiarity dot first.
Labels: EN `GK, D (L/C/R), WB (L/R), DM, M (L/C/R), AM (L/C/R), ST (C)`;
ES `POR, DF (I/C/D), CR (I/D), MCD, M (I/C/D), MP (I/C/D), DL (C)`.
Wherever a short label is shown, its `title` gives the full name (`posName(code)`, from
`POS_NAMES` in strings.ts: "Centre Back" / "Defensa central").

**Lineup tiers.** Starter (`XI`, accent), main sub (`SUB`/`SUP`, info), auxiliary sub
(`AUX`, muted), using `.tier-chip--starter|main|aux`. Full names go in the `title`.

**Roles.** FM26 roles depend on position **and** phase (`rolesFor(pos, phase)`). Pitch tokens
show the role abbreviation in the current language, or the position label if there is no role.
A player arriving in a slot gets his own remembered role there, else the position's FM26
default; roles never pass to another player or slot. Users can type
a custom role (`custom:<text>`).

**Attribute ratings (1–20).** Use this fixed scale on every screen, always showing the number:
1–5 `--danger` (poor) · 6–10 `--warning` (average) · 11–15 `--accent` (good) ·
16–20 `--info` (elite).

**Star ratings** (CA/PA) are 0.5–5 stars, drawn as icons with an `aria-label` such as
"3.5 of 5 stars".

**Money and dates.** Use compact money ("€12.5M", "€45K/wk"). Show contract expiry as a
date, in warning colour when it is less than 12 months away. Format with the current language.

## Pitch rules

- Vertical pitch, attack upwards, ratio 68:112 (longer than real, so the stacked token labels fit),
  at least `--pitch-min-h` (650px) tall on desktop only (not ≤860px nor on touch devices,
  `pointer: coarse`: phones and tablets fit the pitch to the screen), striped green (`--pitch-a/b`), SVG markings.
  There are 24 fixed slots (`SLOTS` in positions.ts): 5 columns × rows ST/AM/M/DM-WB/D/GK.
- Token = disc (`--token-size`) with a familiarity ring and role abbreviation, plus a dark
  name label (surname, truncated). Empty slots are small faint dots that grow into dashed
  targets while dragging or placing.
- **Starters view:** the XI only. The 11th place is the goalkeeper's (10 outfield starters max,
  with a toast in both languages); the GK slot may be empty.
- **Substitutes view:** keep the starters' slots and show each slot's main sub there. A slot
  with a starter but no sub shows a dashed "No sub" disc; if that starter's main sub plays
  in another slot, it shows a small dot in the starter's link colour instead. Subs in slots
  the XI doesn't use are drawn at 50% opacity, except a main sub playing a different
  position (`PosCode`) than the starter he replaces, who is drawn at full opacity.
- **Sub links:** every sub replaces a starter (`replaces`). Each starter has a colour
  (`--link-1…11`, `linkColors()` in `components/links.ts`, same colour in both phases); the
  sub's disc ring takes it (instead of the familiarity colour) and the token gets a second
  label with a swatch and the starter's surname. Colour is never alone: the name is always shown, and the slot `aria-label` says
  "Replaces {name}". The +N popover, the slot panel and the player editor show the same
  swatch; the panel and editor change an aux sub's link with `ReplaceSelect`. A main sub's
  starter is fixed when he's placed, so `ReplaceSelect` shows it as text. A **+N** pill (warning colour) appears when there are auxiliary
  subs; it opens a popover listing everyone assigned, each with a × to remove them from the
  position (the popover closes when no auxiliary sub is left). Starters are never main subs, so
  no main sub token is ever a starter.
- Clicking a slot opens `SlotPanel`: assigned players (role select, remove, make main) and
  candidates who can play there, with a toggle to show the rest. In the subs view, the slot's
  own starter is never a candidate, and other starters are disabled as main sub (title
  explains why) but can still be added as aux with +.
- **Squad list in the subs view:** starters of the phase stay listed (`.row--locked`) but
  can't be dragged, and their Place button is disabled with the reason as its title.
- **Transfer targets** (players you could sign) use `--target` (lilac) with the `star` icon.
  The squad column has a `Squad | Targets` radiogroup (each with a `.count`); the add button
  follows it. Target rows: planned slot + role per phase (star, slot, role abbreviation),
  positions, and actions Place, Sign (`userCheck`), Copy name, Edit, Remove (ConfirmDialog).
  Placing or dropping a target on a slot plans him there **for the phase on screen** (each
  phase can have its own slot); the slot shows a `.target-pip` (star + count, bottom-right of
  the disc, in both views and in the slot `aria-label`) in that phase, and `SlotPanel` lists
  the slot's targets (role for the current phase, Sign, remove from position in this phase).
  `SignDialog` asks "As starter" / "As substitute", previewing who moves where in each phase
  (phase chips; read from `signTarget`'s result, never re-computed in the UI); an option that
  would fail shows the error and is disabled. Targets never appear as squad candidates or in counts.
- **Promotion:** in `SlotPanel` (subs view) main sub rows have "Make starter" (`arrowUp`): he
  and the starter he replaces swap tiers, each staying in his own slot, in both phases. Aux
  rows only have "Make main sub" (aux subs can't go straight to starter). Errors (XI full)
  show as a toast; Undo covers it, so there's no confirm.
- **Squad row actions:** Place, Copy name, Edit and Remove (trash, danger colour on hover, asks with
  `ConfirmDialog` because it also removes the player's lineup spots). 32px buttons in the table.
  Copy name gives feedback in the button itself for 1.5 s: a check in `--accent`
  (`.icon-btn--done`), or an x in `--danger` (`.icon-btn--failed`) if the clipboard refuses,
  with title and aria-label saying so.
- **Main subs only where a starter plays:** placing a new main sub on a slot with no starter
  adds him as aux (no error), and "Make main sub" is hidden there. Dragging an existing main
  sub on the pitch keeps him main for the same starter, wherever he's dropped. An aux sub's `ReplaceSelect`
  has a "Replaces nobody" option; a main sub always replaces someone.
- The panel closes on Esc, its × button, or a click outside it. Clicks on pitch slots, the
  +N popover and dialogs don't count as outside, and neither does the click that ends a drag.
- A drop does **not** open the panel (it would cover the pitch while arranging the XI). Placing
  with the Place button then a slot click does open it, so the role can be picked straight away.
- Every token on the pitch has a small **×** button (top-left of the disc, opposite the +N
  pill) that removes the shown assignment without opening the panel. It appears on hover,
  focus or selection, is always visible on touch (`hover: none`), and hides while dragging or
  placing. No confirm: Undo covers it.

## Interaction rules

- **Drag and drop** uses `dnd.tsx`: pointer events (mouse + touch). Draggables call
  `startDrag(e, payload)` and set `touch-action: none` on the handle. Drop targets carry
  `data-drop-slot`. A press without movement stays a click. Esc cancels.
  Squad rows drag from the grip, the name or the row's empty space with mouse/pen (`.row-drag`,
  grab cursor; the name keeps the pointer cursor since a click opens the editor); labels,
  badges and the other buttons don't start a drag and stay selectable. A row that can't be
  dragged (`.row--locked`) shows the `not-allowed` cursor on its grip and empty space, a muted name, a slightly
  lighter background (4% `--text`) with no hover highlight, and a `--danger` grip on hover. Touch drags
  only from the grip so swipes still scroll. Card labels are real `.cell-label` spans.
- **Every drag has a non-drag path** (keyboard fallback: select, then choose target): the
  "Place on pitch" button (then pick a slot), or click a slot and choose from the list.
- Destructive actions (remove player, delete team, import) use `ConfirmDialog`. Small
  reversible ones (remove from a position) don't, because Undo (Ctrl/Cmd+Z) covers them.
  Redo (Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z, header button next to Undo) re-applies undone
  changes until a new change is made.
- Errors from lineup rules (for example 11 starters max) show as a toast, in both languages.
- Dialogs: `Modal` traps focus, closes on Esc and on a backdrop click, and runs focus logic
  **once** per open (keep `onClose` in a ref). Re-running focus code on each render causes
  blur→save→render loops. Inputs that save on blur must skip unchanged values.

## Layout

- **Desktop:** header (team picker, undo, redo, export/import, ES/EN). Below it, two
  columns: a sticky pitch column (phase + view switches, starter count, pitch) and the
  squad table. `SlotPanel` floats over the right edge without blocking the pitch.
- **<1300px:** the squad table turns into cards (grip + name + actions on top, labelled rows
  below), because the squad column is too narrow for the table (~690px). Re-measure this
  breakpoint in ES and EN when columns change. Never make the page scroll sideways.
- **≤860px:** a bottom tab bar (Pitch / Squad), the panel becomes a bottom sheet, dialogs
  become bottom sheets; squad cards lose the drag grip (use Place).
- **≤520px:** export/import leave the header (they're in the Teams & data dialog).
- **<420px:** pitch tokens show only the disc; the name and "replaces" labels appear on the
  selected slot only (it's raised above its neighbours). The `aria-label` keeps them.
- **Squad table:**
  - Columns: Name · lineup *In possession* · lineup *Out of possession* (each: tier chip, slot,
    role, +N; sortable) · Positions (one merged list, `mergePositions()`).
  - Sticky header; sortable columns with a visible direction and `aria-sort`.
  - Its scroll area fills the window but is never shorter than `--pitch-min-h` on desktop
    (same rule as the pitch; no minimum on touch devices).
  - Filters (All / Starters / Subs / Unassigned) and search. Statuses combine (toggle
    buttons with `aria-pressed`); from All, a status shows only that one, and deselecting
    the last one goes back to All. The status filter is kept per pitch view for the session
    (not saved): Starters view starts on All, Subs view on Subs + Unassigned; a filter
    picked in a view comes back with that view.
  - Compact rows (aim for 36–40px per line, short tier chips), hover highlight.
  - Numbers right-aligned and `tabular-nums`.
  - When columns grow (attributes), add a column picker and a density toggle rather than
    scrolling a wide table sideways.

## Future screens (follow when built)

- **Player card / profile:** header with name, age, nationality flag, positions per phase,
  CA/PA stars, value and wage. Below it, attributes in three groups (Technical / Mental /
  Physical, or Goalkeeping for GKs) using the 1–20 scale.
- **Comparison:** two or three players side by side, highlighting the better value in each row.
- **Navigation:** once there are more than two areas (Squad, Tactics, Transfers, Scouting,
  Settings), use a left sidebar on desktop and keep the bottom tab bar on phones. Always show
  where the user is.
- **Import from screenshot (built):** the player editor's "Fill from screenshot" strip (paste,
  choose, drop; pasting an image on the main screen opens it) fills the normal editor, which is
  the review step. Status line: accent for success, warning for partial reads, danger for errors.
- **(original note)** Show what was detected for review before saving, with the same
  position picker and familiarity dots used for manual entry.

## Visual rules

- Hierarchy comes from size, weight and muted colour, not nested boxes. Use one border level
  per area.
- Use at most 3 font sizes per screen, with weights 400/500/600 (700 only inside pitch discs).
- Use `--accent` sparingly: one primary button per view, plus selected and active states.
- Motion is 120–200ms (`--fast`, `--ease`) for hover, selection and panels, and none under
  `prefers-reduced-motion`.
- Empty, loading and error states are required:
  - An empty squad shows a call to action on both the pitch and the list.
  - Filters with no results offer "Clear filters".
  - Slow data gets skeleton rows.
- Icons come only from `Icon.tsx` (Lucide-style 24px strokes): 16px inline, 20px in navigation.
  To add one, add its path there.

## Accessibility (required)

- Text contrast ≥ 4.5:1 (check `--text-muted` on `--surface-2`).
- `:focus-visible` ring: `outline: 2px solid var(--accent); outline-offset: 2px`.
- Hit areas ≥ 32px, and ≥ 44px for pitch slots and touch.
- Pitch slots are buttons whose `aria-label` reads the position, player, role and tier.
- Segmented switches use `role="radiogroup"`/`radio` with `aria-checked`; multi-select ones
  (squad status filter) use `role="group"` with `aria-pressed` buttons. Tables use
  `<table>`, `<th scope>` and `aria-sort`.

## Testing without network

If `npm install` can't run, bundle with any local esbuild
(`esbuild src/main.tsx --bundle --jsx=automatic`) using a local React, and drive it with
Playwright. Do click, mouse-drag and touch-drag (CDP `Input.dispatchTouchEvent`), and watch
`pageerror` for loops. Lineup rules are covered by `npm test` (Vitest); keep rules out of
components so they stay testable.

## Before you finish — checklist

- [ ] Only tokens used; no stray hex or magic numbers in components
- [ ] Every new string exists in `es` and `en`
- [ ] Familiarity, position, tier and rating colours use the shared scales and always have
      text or a title
- [ ] Numbers are tabular and right-aligned
- [ ] Works with the 25-player example, long names, missing roles, empty squad
- [ ] Starters and Subs views both correct in both phases (faded slots, +N, sub link colours and names)
- [ ] Checked at 390px and 1280–1366px widths
- [ ] Keyboard-only: place a player, pick a role, close panels with Esc; focus ring visible
- [ ] Mouse drag and touch drag both work; no `pageerror` in the console
- [ ] `npm run typecheck` and `npm test` pass
- [ ] Empty / loading / error states present
- [ ] Screenshot reviewed
