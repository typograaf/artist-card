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
- **Rows** top / bottom counts. **Focus** picks the half whose blocks are 2x thick.
- **Blocks** unit size, independent movement amount, seed. Each row's block
  width is 1, 2 or 3 units and animates between those values (a horizontal
  scale about the seam) with the opening easing and stagger, plus seeded
  extra moves during the holds when "Independent movement" is above 0.
- **Opening** duration, stagger per row, stagger order, easing (presets or a
  custom cubic-bezier).
- **Opening shape** hole size, variation and seed: how far each row's two
  halves slide apart, snapped to a 2-unit grid.
- **Timeline** hold closed / hold open; the loop is closed hold, open, open
  hold, close. Space plays and pauses, the Time slider scrubs.
- **Text / Colours / Background image** labels, label font (Google Fonts
  name or a local font file), six colours, cover-fit image with zoom and
  position.
- **Settings** copy / paste the whole state as JSON.

The default easing `cubic-bezier(0.70, 0.15, 0.05, 0.80)` and the label
fold timings were measured from the reference video.
