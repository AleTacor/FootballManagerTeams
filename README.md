# FootballManagerTeams
Manage players and staff from football manager

A React app to plan your Football Manager 26 squad: who plays where **in possession** and
**out of possession**, with starters, main substitutes and auxiliary substitutes for every position.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run typecheck  # TypeScript check
npm test           # unit tests (Vitest)
npm run test:images # screenshot-reading tests; needs local FM26 screenshots in
                    # src/test/fixtures/ (git-ignored, so not in the repository)
```

Requires Node 20.19+ (or 22.12+).

## What it does

- **Squad list**: every player with where they sit in the lineup in each phase (*In
  possession* and *Out of possession* columns, both sortable) and the positions they can play,
  with how used they are to each one (FM familiarity dots).
- **Pitch**: FM-style tactics pitch for each phase (*In possession* / *Out of possession*) with
  each player's role.
  - **Starters** view shows the starting XI.
  - **Substitutes** view keeps the starting positions but shows each position's main sub.
    Subs assigned to positions the starters don't use appear faded. A **+N** badge marks
    positions with auxiliary subs; click it to see everyone assigned there. Starters who are
    also subs somewhere else get a dashed ring and an **XI** badge.
- **Drag and drop**: drag players on the pitch (swap or move), or from the squad list onto the
  pitch. Works with mouse and touch. Keyboard alternative: use the **Place on pitch** button,
  then pick a position.
- **Click a position**: see who is assigned and set the role (FM26 roles for that position and
  phase, or a custom role). You can also remove players from the position, promote an
  auxiliary sub to main sub, and pick any player who can play that position (sorted by
  familiarity) to replace the current one.
- **Players**: add, edit or remove players. Pick positions on a mini pitch (they apply to both phases), with
  optional familiarity: Natural, Accomplished, Competent, Unconvincing, Awkward, Ineffectual or
  Unknown. The edit dialog also lists and edits all of the player's lineup positions.
- **Fill from a screenshot**: paste (Ctrl/Cmd+V), drop or choose a screenshot of the player's
  FM26 profile (*Overview* tab). The app reads the name and every position with its
  familiarity, fills in the player dialog, and you check it before saving. It runs entirely in
  the browser (Tesseract OCR, bundled), works offline, and expects the default FM26 skin.
  Pasting an image anywhere on the main screen opens it straight away.
- **Several teams**, **undo** (Ctrl/Cmd+Z), **Spanish / English**, **dark / light** theme.
- **Storage**: everything is saved in the browser (`localStorage`). Use **Export** and
  **Import** to back up your data or move it to another browser (JSON file).

## Rules the app applies

- At most 11 starters per phase, and each player starts in at most one position per phase.
- One main sub per position. A player can be main or auxiliary sub in several positions.
- Roles belong to the position: when you replace or swap players, the position keeps its role.
- Replacing a starter in one phase also swaps him in the other phase (as a substitution
  does in the game).

## Project layout

```
src/
  domain/      types, positions & pitch slots, FM26 roles, lineup rules (pure functions)
  state/       store (undo history), localStorage, import validation
  i18n/        Spanish and English texts
  components/  Pitch, SlotPanel, SquadList, PlayerEditor, drag and drop…
  styles/      tokens.css (design tokens) and app.css
  data/        example squad (fictional players)
```

UI rules live in [`skills/ui-design/SKILL.md`](skills/ui-design/SKILL.md) (design tokens, familiarity colours, layout and accessibility). Notes for Claude Code are in [`CLAUDE.md`](CLAUDE.md).

## Coming next

- Player profiles with attributes (1–20) and a comparison view.
