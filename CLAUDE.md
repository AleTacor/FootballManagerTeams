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
npm run lint       # ESLint (eslint.config.js); lint:fix applies the safe fixes
npm run check      # lint + typecheck + test + test:images (what the pre-commit hook runs)
npm test           # Vitest unit tests (run once); no images needed
npm run test:images # screenshot/OCR tests on local images in src/test/fixtures/ (git-ignored)
npm run test:watch # Vitest in watch mode
npm run preview    # serve the production build
```

After any code change, run `npm run typecheck`, `npm run lint` and `npm test`; all must pass
(lint with no errors or warnings).

**Pre-commit hook**: `.githooks/pre-commit` runs `lint`, `typecheck`, `test` and `test:images`
and aborts the commit if any fails. `npm install` enables it (`prepare` sets
`core.hooksPath`). Don't bypass it with `--no-verify`; fix the failure instead. After changing
`src/screenshot/`, also run `npm run test:images` (it skips cases whose image isn't there).

**CI**: `.github/workflows/ci.yml` runs `lint`, `typecheck` and `test` on every pull request
(no `test:images`: the fixtures aren't in the repository).
`.github/CODEOWNERS` makes `@AleTacor` the owner of everything.

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
    logic.ts       # lineup rules: assignPlayer, moveAssignment, promoteToMain, removePlayer…, copyTeam (new ids)
  state/
    store.tsx      # StoreProvider/useStore: data, updateTeam (records undo), setSettings, undo, redo
    storage.ts     # localStorage load/save, export, parseData (validates every import)
  i18n/
    strings.ts     # all UI strings (en is the source of keys; es must match), position and familiarity labels
    I18n.tsx       # useI18n(): t(key, vars), pos(code), fam(level), lang
  components/      # Pitch, SlotPanel, SquadList (+ TargetList, PlayerCells), SignDialog, PlayerEditor, PositionPicker, RoleSelect,
                   # Header (teams, undo/redo, import/export, language), Modal, Sheet, dnd, Icon
  styles/
    tokens.css     # design tokens (dark theme only)
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
- An `Assignment` = `{ playerId, phase: 'ip'|'oop', tier: 'starter'|'main'|'aux', slot: SlotId, role, replaces }`.
  Lineups are just the list of assignments of the active team. `replaces` (subs only) is the
  id of the starter the sub comes on for; `slot` is where the sub plays, which may be another
  position. Null for starters.
- Slots (`DCL`, `DCC`, `MCR`, `STC`…) are concrete pitch spots. Each maps to a `PosCode`
  (`DC`, `MC`, `ST`…), which is what familiarity and roles are keyed by.
- `role` is a role id from `roles.ts`, `custom:<text>`, or `null`.
- `Player.roles` (optional) remembers the player's last role per phase and slot
  (`{ ip: { DCL: 'bpcb' } }`). Per slot, not per `PosCode`: MCC and MCR keep separate roles.
- **Transfer targets** (players you could sign) are `Player`s with `target: { slots: { ip, oop } }`.
  They live in `team.players` but are not in the squad: `squadPlayers()` / `targetPlayers()`
  split them, and every squad view (lists, candidates, counts) uses `squadPlayers()`. `slots`
  is the planned slot per phase (or null); the planned role per phase is the player's
  remembered role there. `parseData` also reads a draft shape with one `slot` for both phases.
- `AppData` = `{ version: 3, settings: {lang}, teams[], activeTeamId }`, stored under
  the `fm-teams:v1` key. v1 had no `Player.roles`; importing it seeds them from the assignments.
  v2 had no transfer targets and imports unchanged.
  Older data may carry `settings.theme`: it's ignored (the app is dark-only).

### Lineup rules (enforced in `logic.ts`, not in components)

- At most **11 starters per phase**; a player starts in at most one slot per phase.
- **Goalkeeper**: at most 10 outfield starters per phase (`outfieldFull` error): the 11th place
  is the GK slot, which may stay empty. The goalkeeper is the same player in both phases
  (`syncGoalkeeper`): putting someone in goal in one phase does it in the other (swapping with
  whoever was there); nobody is ever put in goal automatically. Subs follow the GK rule
  (`canReplace`): a sub in the GK slot replaces the starting goalkeeper, and only subs in the
  GK slot do. The GK sub may be empty.
- **Starts are linked across phases**: a player starts in both phases or in neither. A new
  starter also starts in the other phase (same slot if free there, else the nearest free slot
  of the same position, else one he can play, else the nearest: `partnerSlot`). Removing or
  losing a start removes both.
- **Main subs are linked the same way** (`linkMains`, run after every command): a player is
  main sub in both phases or in neither. A new main sub gets a spot in the other phase,
  preferring the slot where the same starter plays there (`mainPartnerSlot`); someone who
  stops being main sub in a phase (removed, replaced, demoted to aux) stops in the other too.
  Aux subs are not linked. `parseData` links older data with `linkLineup()`.
- One **main sub** per slot and phase, and per starter. A player can be main or aux sub in
  several slots, but never a sub of the slot he starts in. **A starter is never a main sub**
  (`starterNotMain` error; becoming a starter drops all his main sub spots); he can be aux.
  **New main subs only go where a starter plays**: adding a main sub (from the list, the panel
  or the squad) to a slot with no starter adds him as an aux sub instead, and an aux sub there
  can't be promoted. Moving an existing main sub (drag on the pitch) keeps him main, for the
  same starter, wherever he goes.
- **Sub links** (`normalizeLinks`, after every command): every main sub replaces a starter of
  his phase (by default the starter of his slot; `defaultLink`). An aux sub's link is optional:
  a new one replaces the starter of his slot, or nobody if the slot is empty (`auxLink`), and
  the user can set it to nobody. A link that stops working (the starter left) falls back to
  the same defaults. Moving a sub keeps his link (he only plays elsewhere);
  `setReplaces()` changes it (for a main sub, in both phases). The UI only lets users change
  an aux sub's link; a main sub's starter is fixed by where he's placed. When a starter is replaced,
  his subs pass to the newcomer. If two main subs replace the same starter, the one just
  placed or set wins and the other is relinked to a starter without a main sub, or to nobody.
- **Role on arrival** (any placement, replacement, swap or move): the player's remembered role
  for that slot and phase, else the FM26 default (`defaultRole()`, first role of the
  position's list). A role never passes to another player (replacing, swapping) nor travels
  with a player to another slot, even of the same position. Only an aux sub promoted to main
  in the same slot keeps his role. Every role a player gets, or the
  user sets, is remembered in `Player.roles`; clearing a role forgets it.
- Replacing a starter in one phase **mirrors the substitution in the other phase**, if the
  incoming player isn't already a starter there. Replacing a main sub mirrors it too: the
  replaced player's main sub spot in the other phase covering the same starter, else the same
  slot, else his only one (skipped if unclear or the incoming player starts in that slot; the
  main sub link then fixes both players). The incoming player gets his own
  remembered role in each slot (see Role on arrival).
- **Transfer targets never have assignments** (`assign` ignores them, `linkLineup` drops any).
  Placing one (Place button, drag) plans his slot for the phase on screen (`planTarget`; an
  unplanned other phase gets the same slot), with his remembered or default role there;
  `setTargetRole` changes the planned role.
- **Taking over** (`takeOver`, shared by promoting a main sub and signing a target as
  starter) swaps tiers in place, in both phases, and **never moves another starter**: the
  newcomer starts in his own spot (main sub spot / planned slot) and the starter he replaces
  becomes his main sub in that starter's own slot, each keeping his role (that starter's old
  slot is left empty when the spots differ). Main subs who covered the replaced starter (or
  played in his slot) drop to aux. In a phase where the newcomer has no spot, someone else
  starts in it, or it would change the goalkeeper, he takes the replaced starter's slot.
- **Stepping in** (`stepIn`) is for when there's no starter to swap with: as starter he just
  starts (if the XI has room; in the other phase in his slot there only if it's free); as sub,
  in each phase with a slot, the main subs covering that slot's starter become aux and he
  becomes main sub (aux if nobody starts there). Errors as `assignPlayer`.
- **Signing** (`signTarget(team, id, 'starter'|'sub', phase)`) removes `target`; as starter
  with a starter in his planned slot it's `takeOver`, otherwise `stepIn`. It starts from
  `phase` unless only the other phase has a plan or (as starter) only the other phase's
  planned slot has a starter to replace. No plan: he just joins the squad.
- **Promoting** a main sub to starter (`promoteToStarter(team, assignmentId)`) **swaps tiers
  in place, in both phases**: he starts in his own main sub spot and the starter he replaces
  (else his slot's starter) becomes his main sub in his own slot, each keeping his role
  (e.g. A starts at D (R), B is his main sub at D (C) → B starts at D (C), A is main sub at
  D (R)). If someone else starts in B's spot in a phase, B takes A's slot and A B's spot there.
  Another main sub already in A's slot drops to aux there (see `takeOver`). A main sub with no
  starter to swap with just starts in his slot (`stepIn`). **Aux subs can't be promoted to starter**, only to
  main sub (`promoteToMain`, the slot's previous main sub becomes aux).
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

- `Modal`/`Sheet`/popovers keep `onClose` in a ref (`useLatest()`, `components/useLatest.ts`)
  and set up focus and listeners **once**. Don't write `ref.current = x` during render (the
  `react-hooks/refs` lint rule); reset state on prop changes during render, not in an effect
  (see `RoleSelect`, `Pitch`, `App`).
  Re-running focus logic on re-render caused an infinite blur→save→render loop. Inputs that
  save on blur must ignore unchanged values.
- `store.tsx` keeps the latest data in a ref and records undo history outside React state
  updaters, so StrictMode's double calls don't double the history.
- `build` doesn't type-check; always run `npm run typecheck` as well.
- **Scroll boxes need a positioned ancestor inside them** (`.table-wrap` has `position: relative`):
  `.sr-only` is `position: absolute`, and without one it's placed against the page, escapes the
  scroll box and (in Chromium) stretches the page, leaving blank space below the pitch and the
  list once the squad is long. Firefox doesn't show it, so check `offsetParent` instead.
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
- FM26 role names come from community role lists. Spanish names follow the Spanish game UI
  where known (screenshots, footballmanager.com/es); the rest are inferred from its naming
  patterns (see the comment in `roles.ts`). Spanish abbreviations are ours.

## Roadmap

- Player profiles with attributes (1–20), comparison view; see "Future screens" in the skill.
