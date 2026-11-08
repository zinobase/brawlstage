# BrawlStage — Visual Design Contract

BrawlStage is a ringside console for responsive QA. A component steps into the
ring, gets measured across 33 widths, takes hits from the Saboteur, and either
holds or goes down. The interface reads like a fight card crossed with a
measurement bench: dense, legible, a little loud where it matters, and quiet
everywhere else.

## Product mode

- Mode: `operate`
- Audience and cadence: frontend engineers and design-system owners running
  many short stress rounds a day, often with the agent in the corner giving
  fixes between rounds.
- Primary workflow: open a component, sweep 33 widths, select a failing lane or
  violation box, patch tokens/CSS by hand or hand the selection to the agent,
  then pass the sealed holdout gate.

## Visual direction

- Direction name: **Ringside Floodlight**
- Feeling: a dark arena with one hard light on the canvas. Everything outside
  the stage is carbon; the component under test is the only bright object.
- Palette family: **Ochre / citron** as the single accent ("caution tape"),
  on a carbon-graphite neutral with a faint warm undertone.
  - `--bs-caution` hazard citron — primary action, selected lane, ruler ticks.
  - `--bs-knockdown` signal red — failures only (overflow, collision, contrast).
  - `--bs-clean` chalk green — passing lanes only; never decorative.
  - Holdout lanes are hatched caution stripes, never a fourth color.
- Light theme: newsprint paper (`#F3F1EA`) with ink; caution darkens to ochre
  so text on it keeps 4.5:1.
- Type treatment: **display-led**. `Barlow Condensed` uppercase for labels,
  lane numbers, and round headers (tracking +0.06em); `Inter` for body copy;
  `JetBrains Mono` with tabular numerals for every measured value (px, ratios,
  selectors).
- Composition: **canvas workbench**. Top band = the 33-lane Width Ribbon (a
  proportional 320–1920 px scale with every lane as a hit target). Center =
  the Stage (the live iframe at the active width, scaled with `translate3d`,
  violation boxes drawn over it). Right rail = Corner (findings, token surgery,
  learned rules). Component list is a fight card: one row per component with
  its public and holdout pass bars.
- Shape language: crisp geometry. 2 px radius, 1 px hairlines, no shadows
  except the stage's floodlight edge. Pills are square-cornered tags.
- Motion: lane fills sweep left-to-right as a real measurement progresses
  (each lane lights when its width is measured, not on a timer). Transforms and
  opacity only; reduced motion disables the sweep animation.

## Anti-references

- No purple/indigo gradients, glass, glow blobs, or particle backgrounds.
- No three-card feature grids or hero banners; the data is the page.
- No sparkle, wand, or robot iconography. Agent hand-off uses a plain
  "Send to agent" verb with `IconMessageForward`.
- No status chips that repeat what a lane color already says.
- Never show holdout findings detail to the agent surface; the UI shows
  holdout lanes as sealed (pass/fail only).

## Tokens

All app colors are HSL triplets on `:root` / `.dark` so the toolkit's
semantic utilities (`bg-background`, `text-muted-foreground`, …) inherit the
direction. Domain colors are `--bs-*` tokens consumed through Tailwind
arbitrary values (`bg-[hsl(var(--bs-caution))]`).

## States

- Loading: skeletons match the ribbon (33 thin bars), the stage frame, and the
  rail rows.
- Empty: a fight card with no components shows one action: add a component.
- Error: action errors surface as toasts via `actionErrorMessage`; the gate's
  `HOLDOUT_REGRESSION` shows inline on the gate button as a knockdown banner.
- Narrow width: ribbon scrolls horizontally inside its own track; corner rail
  stacks below the stage under 1024 px.
