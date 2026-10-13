# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**FootballManagerTeams**: a React app to plan Football Manager 26 squads. Users store their
players, the positions each one can play (separately for *in possession* and *out of
possession*, with FM familiarity levels), and build lineups on a pitch: starters, main
substitutes and auxiliary substitutes per position, each with an FM26 role.
Everything runs in the browser. There is no backend; data lives in `localStorage` with
JSON export and import.

UI languages: Spanish and English. The user writes in English or Spanish; code, comments and
commit messages are in English.

## Commands

```bash
npm install
npm run dev        # Vite dev server, http://localhost:5173
npm run build      # production build to dist/ (vite build, no type check)
npm run typecheck  # tsc --noEmit — run this after code changes
npm test           # Vitest unit tests (run once); no images needed
npm run test:images # screenshot/OCR tests on local images in src/test/fixtures/ (git-ignored)
npm run test:watch # Vitest in watch mode
npm run preview    # serve the production build
```

After any code change, run `npm run typecheck` and `npm test`; both must pass. After changing
`src/screenshot/`, also run `npm run test:images` (it skips cases whose image isn't there).

## Tests

- **Vitest**, Node environment, no DOM. Tests sit next to the code as `*.test.ts`:
  - `domain/logic.test.ts`: every lineup rule, plus a seeded fuzz test (2000 random edits on
    the example squad) that checks the invariants after each step.
  - `domain/search.test.ts`: name search ignores case and accent marks (`matchesQuery`).
  - `domain/roles.test.ts`, `domain/positions.test.ts`: catalogue integrity (every position
    has roles, abbreviations unique per position/phase, slot layout).
  - `state/storage.test.ts`: import validation, localStorage load/save, corrupt or blocked storage.
  - `i18n/strings.test.ts`: `es` and `en` have the same keys and `{placeholders}`, and no empty texts.
  - `data/sample.test.ts`: the example squad obeys all rules and survives export/import.
  - `screenshot/detect.test.ts`: image-free checks (dot colours, name cleanup, vote, accent
    marks drawn in the test).
  - `screenshot/detect.images.test.ts` (**`npm run test:images` only**): reads positions and
    name from real FM26 screenshots in `src/test/fixtures/` (ES/EN UI, 1080p/4K/small UI scale,
    also resized to 0.6× and 1.5×), runs Tesseract (5 variants + vote) on the names, and checks
    accents on synthetic names in `fixtures/accents/` (+ `names.json`).
  - **Images never go to the repository**: `src/test/fixtures/` and `ScreenShots/` are
    git-ignored. Expected results live in the test file; missing images are skipped. New
    screenshot that reads wrong = copy it into the fixtures folder and add a case.
- Shared builders and the rule checker are in `src/test/helpers.ts`: `player()`, `asg()`, `team()`,
  `invariantErrors()`, `snapshot()` and `rng()`. `src/test/png.ts` decodes/encodes PNGs for
  fixtures with `node:zlib` (test files reference Node types with `/// <reference types="node" />`).
- **New lineup rule = new test** in `logic.test.ts`, and extend `invariantErrors()` if the rule
  is an invariant.
- **New string = both languages**, or `strings.test.ts` fails.
- Assert that logic functions don't mutate their input (`snapshot()` before/after) and return
  the same object for no-ops.
- Component tests are not set up. If needed, add `jsdom` and `@testing-library/react` and use
  `// @vitest-environment jsdom` in those files only.

## UI work: use the ui-design skill

**Before any UI change** (screens, components, CSS, pitch, tables, dialogs), read and follow
[`skills/ui-design/SKILL.md`](skills/ui-design/SKILL.md). It defines the design tokens,
familiarity, position and tier colours, pitch rules, layout breakpoints, accessibility rules
and a checklist that must pass before UI work is done. Update the skill when you introduce a
new UI convention.

## Architecture

```
src/
  domain/          # no React here
    types.ts       # Player, Assignment, Team, AppData, Phase, Tier, PosCode, SlotId, Familiarity
    positions.ts   # 14 position codes, 24 pitch SLOTS (x/y %), familiarity order/rank
    roles.ts       # FM26 roles per position group and phase, ES/EN names + abbreviations
    logic.ts       # lineup rules: assignPlayer, moveAssignment, promoteToMain, removePlayer…
  state/
    store.tsx      # StoreProvider/useStore: data, updateTeam (records undo), setSettings, undo
    storage.ts     # localStorage load/save, export, parseData (validates every import)
  i18n/
    strings.ts     # all UI strings (en is the source of keys; es must match), position and familiarity labels
    I18n.tsx       # useI18n(): t(key, vars), pos(code), fam(level), lang
  components/      # Pitch, SlotPanel, SquadList, PlayerEditor, PositionPicker, RoleSelect,
                   # Header (teams, import/export, theme, language), Modal, Sheet, dnd, Icon
  styles/
    tokens.css     # design tokens for dark (default) and light themes
    app.css        # component styles; uses tokens only
  screenshot/
    detect.ts      # pure pixel reading of an FM26 profile: positions pitch dots, name above the Actions button
    read.ts        # browser side: Blob → pixels, lazy Tesseract OCR of the name (bundled worker/core/data)
  data/sample.ts   # example squad of fictional players ("Load example squad")
  test/helpers.ts  # test builders and lineup invariant checker
  **/*.test.ts     # unit tests (Vitest), next to the code they test
```

### Data model

- A `Player` has `positions: { ip: {PosCode: Familiarity}, oop: {...} }`. The player editor shows
  one map and saves it to both phases (FM26 positions don't depend on the phase); a player whose
  phases differ (older data, the example squad) opens merged with `mergePositions()`.
- An `Assignment` = `{ playerId, phase: 'ip'|'oop', tier: 'starter'|'main'|'aux', slot: SlotId, role }`.
  Lineups are just the list of assignments of the active team.
- Slots (`DCL`, `DCC`, `MCR`, `STC`…) are concrete pitch spots. Each maps to a `PosCode`
  (`DC`, `MC`, `ST`…), which is what familiarity and roles are keyed by.
- `role` is a role id from `roles.ts`, `custom:<text>`, or `null`.
- `AppData` = `{ version: 1, settings: {lang, theme}, teams[], activeTeamId }`, stored under
  the `fm-teams:v1` key.

### Lineup rules (enforced in `logic.ts`, not in components)

- At most **11 starters per phase**; a player starts in at most one slot per phase.
- One **main sub** per slot and phase. A player can be main or aux sub in several slots, but
  never a sub of the slot he starts in.
- **Roles belong to the slot**: replacing or swapping players keeps the slot's role. Moving to
  a different position clears the role only if it isn't valid there.
- Replacing a starter in one phase **mirrors the substitution in the other phase**, if the
  incoming player isn't already a starter there.
- Logic functions are pure and return a new `Team` (or `{ team, error }`). Components call them
  through `updateTeam(tm => …)` so every change gets an undo step.

## Conventions

- **No hard-coded UI text**: add keys to `strings.ts` in both `en` and `es`.
- **No raw colours or sizes in components**: use tokens from `tokens.css`.
- **Few dependencies**: React and `tesseract.js` at runtime. Tesseract is only loaded on the
  first screenshot import (dynamic import); its worker and WASM core come from `node_modules`
  via `?url`, and the Spanish data is `public/tessdata/spa.traineddata.gz`
  (`@tesseract.js-data/spa`, 4.0.0_best_int), so nothing comes from a CDN. Drag and drop (`components/dnd.tsx`, pointer
  events for mouse and touch) and icons (`components/Icon.tsx`) are in-house. Ask before adding
  a library.
- **Persistence changes**: if `AppData` changes shape, bump `version`, migrate in
  `storage.ts#parseData`, and keep old exports importable. Never trust imported JSON; validate
  every field.
- Every drag-and-drop action needs a non-drag alternative (the Place button, or click a slot
  and pick from the list).

## Gotchas

- `Modal`/`Sheet`/popovers keep `onClose` in a ref and set up focus and listeners **once**.
  Re-running focus logic on re-render caused an infinite blur→save→render loop. Inputs that
  save on blur must ignore unchanged values.
- `store.tsx` keeps the latest data in a ref and records undo history outside React state
  updaters, so StrictMode's double calls don't double the history.
- `build` doesn't type-check; always run `npm run typecheck` as well.
- **Screenshot reading** is tuned to the default FM26 skin: pitch rgb(13 68 57), the six dot
  colours (hue order = familiarity order) and the purple Actions button rgb(110 15 215), which
  anchors the name, are constants in `detect.ts`. The squad-number badge takes the club's
  colour or is missing, so don't anchor on it.
- **Accents in names** don't come from Tesseract: the bundled Spanish model has no â/ç/ğ/č…,
  and at this size it confuses á/â/a anyway (other language packs didn't help; the Latin-script
  model is 89 MB). The vote ignores accents (`pickRead`), then `restoreAccents` reads the marks
  above/below each letter from a 120 px rendering, using Tesseract's letter boxes. Ø, Ł and the
  ogonek (ę) aren't recovered yet; the user fixes them in the editor. The dev server reloads the page
  once the first time `tesseract.js` is imported (dependency pre-bundling); that's expected.
- FM26 role names come from community role lists; the Spanish names are our translations and
  may differ from the official Spanish edition.

## Roadmap

- Player profiles with attributes (1–20), comparison view; see "Future screens" in the skill.
