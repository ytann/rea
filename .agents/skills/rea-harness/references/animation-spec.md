# Animation spec (REA harness)

Turns a REA evidence bundle into Manim animations: one clip per system, plus a
process-flow clip of all systems and their relationships.

## Input

The evidence bundle (`evidence-schema.json` shape):

- `systems[]`: `{id, name, justification, evidence_class}` — one animation each.
- `flows`: `{upstream, downstream, telemetry}` — `upstream`/`downstream` entries
  are `{from, to}` dicts naming systems by `id` (fallback: by `name`). Used for
  arrows in the process-flow scene. If absent or empty, systems chain
  left-to-right in bundle order.
- `target`: `{kind, source, ...}` — shown when `systems` is empty.

## What gets animated

- **Component** (`component_<id>`): rounded box (colored stroke + translucent
  fill) with the system `name` and a small `evidence_class` tag; box draws in
  (Create), then the `justification` caption fades in below.
- **Process flow** (`process_flow`): all systems laid out in a grid (up to 3
  columns) when flow edges exist, otherwise a single left-to-right row. Nodes
  appear sequentially, then arrows (flow edges, or the chain) draw in.
- **Empty bundle** (`no_systems`): target kind/source plus "no systems
  inferred"; exit code stays 0.

## Output filenames

| File                   | Content                           |
| ---------------------- | --------------------------------- |
| `component_<id>.<fmt>` | one system                        |
| `process_flow.<fmt>`   | all systems + relationships       |
| `no_systems.<fmt>`     | generic scene for empty `systems` |

`<fmt>` is `mp4` when ffmpeg is on PATH, else `png` (still frame via
`save_last_frame`). `render.py` prints the chosen format and the output files.

## evidence_class → color mapping

| class | meaning     | color  |
| ----- | ----------- | ------ |
| `obs` | observation | green  |
| `der` | derivation  | blue   |
| `inf` | inference   | orange |
| `unk` | unknown     | grey   |

## Usage

```
python render.py --bundle path/to/evidence.json --out outdir/
```

Requires manim (and ffmpeg for video). Rendered in-process at `low_quality`
(480p) to keep renders fast.
