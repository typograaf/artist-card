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
- **Background image** load / remove, cover-fit with zoom and position;
  drag the preview to reposition.
- **Text** artist, stage, date; label font by Google Fonts name (weight 800
  when the family has it) or a local font file.
- **Timeline** hold closed / hold open; the loop is closed hold, open, open
  hold, close. Space plays and pauses, the Time slider scrubs, arrow keys
  step one frame (Shift: ten), Home goes to the start.
- **Rows** top / bottom counts. **Thick blocks** picks the half whose blocks
  are one unit thicker (2/3/4 units instead of 1/2/3, as measured in the
  reference).
- **Blocks** unit size, extra block moves, block move length, seed. Each
  row's block width is 1, 2 or 3 units and glides between neighbouring
  values (a horizontal scale about the seam) in transitions of "Block move
  length" (3 s like the reference) using the opening easing: one starts with
  the row's opening, extra ones fill the open hold ("Extra block moves"),
  and one starts with the closing and may run on across the loop point, so
  the rows are in motion about half the time, as in the video. Transitions
  never overlap and the loop is seamless.
- **Opening** duration, stagger per row, stagger order (closing runs in the
  reverse order, outer rows first, like the reference), easing (presets or a
  custom cubic-bezier; the same curve drives the block moves).
- **Opening shape** hole width, irregularity and seed: how far each row's two
  halves slide apart, snapped to a 2-unit grid, never widening away from the
  seam.
- **Colours** the two pairs plus label background and text.
- **Settings** copy / paste the whole state as JSON (values are clamped).

The default easing `cubic-bezier(0.70, 0.10, 0.10, 0.90)` over 1.6 s, the
0.15 s stagger, the 3 s block transitions, the label boxes and their fold
timings were all measured from the reference video.
