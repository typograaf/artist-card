# Artist Card

Row-reveal artist card generator. Two halves of horizontal rows, each a strip of
equal-width blocks, split at the centre seam and slide open to reveal a photo
through a stepped hole. Stage name and date live on the closed card; the artist
name unfolds along the bottom once the card is open. Exports PNG stills and
one-loop H.264 MP4s.

## Run

```
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/
```

## Controls

- **Format** 4:5, 16:9, 9:16, 1:1 (1080-based canvases, export at 1x or 2x).
- **Background image** load / remove, cover-fit with zoom; drag the preview
  to reposition.
- **Text** artist, stage, date. Labels are set in Avantt Bold at -2%
  tracking (the reference's font); the font files are expected in
  `public/fonts/` and are not part of the repo (licensed).
- **Timeline** hold closed / hold open; the loop is closed hold, open, open
  hold, close. Space plays and pauses, the Time slider scrubs, arrow keys
  step one frame (Shift: ten), Home goes to the start.
- **Rows** top / bottom counts. **Thick blocks** picks the half whose blocks
  are one unit thicker (2/3/4 units instead of 1/2/3, as measured in the
  reference).
- **Blocks** unit size, move length min/max, travel min/max, seed. Each
  row's pattern is never still: its block width glides between 1, 2 and 3
  units and the whole pattern drifts sideways, both as chains of easy-eased
  keyframes with random spacing between the two move lengths and sideways
  steps between the two travel distances, joined by the opening easing. The
  width chain starts a transition with the row's opening and another with
  its closing (same stagger as the hole, running on across the loop point);
  the drift chain runs free and seamless. The pattern scales about a seeded
  point away from the seam, so left and right halves move differently.
- **Floating blocks** per-row count (0 = none), size min/max in units, own
  move length and travel ranges:
  masks inside each open row showing their own two-colour stripes (changing
  like the rows), growing, shrinking to nothing and back (spawn / despawn)
  and drifting, clipped to the hole.
- **Opening** duration, stagger per row, stagger order (closing runs in the
  reverse order, outer rows first, like the reference), easing (presets or a
  custom cubic-bezier; the same curve drives the block moves).
- **Opening shape** hole width, irregularity and seed: how far each row's two
  halves slide apart, snapped to a 2-unit grid, never widening away from the
  seam; 100% opens every row fully.
- **Colours** the two pairs plus label background and text.
- **Settings** copy / paste the whole state as JSON (values are clamped).

The default easing `cubic-bezier(0.70, 0.10, 0.10, 0.90)` over 1.6 s, the
0.15 s stagger, the ~2.6 s block keyframes, the label boxes and their fold
timings were all measured from the reference video.
