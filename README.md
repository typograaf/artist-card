# Motion Tool (Touquet 2027 artist card)

Row-reveal artist card generator. Two halves of horizontal rows, each a strip
of two-colour stripes, split at the centre seam and slide open to reveal a
photo. The stage name and day sit on the closed card; the times, artist name
and stage unfold as word blocks once the card is open. Exports PNG stills and
one-loop H.264 MP4s (1080 wide, 30 fps).

The UI and the card follow the Figma design in Touquet-2027 (frames 229:94,
232:1464); the label blocks reproduce its metrics exactly (Avantt Bold, -2%
tracking, cap-height trimmed text boxes, 3 px side and 12/24 or 18/18 px
vertical padding at 540 wide, 4.5 px gaps).

## Run

```
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/
```

Avantt Bold and SemiBold are expected in `public/fonts/` (licensed, not in
the repo).

## Controls

Left column:

- **Format** 4:5, 1:1, 16:9, 9:16 (1080-based canvases).
- **Day, Time, Artist, Stage** every word becomes its own block. The day is
  set in capitals, the stage is as typed on the closed card and in capitals
  under the artist name. **Image** loads or removes the photo (or drop one
  on the preview, paste one, or click an empty card).
- **Hold closed, Opening time, Opening %, Hold open** the loop is closed
  hold, open, open hold, close. Opening % is how far the rows slide apart;
  the edge blocks stay on top of that.
- **Rows top / bottom** row counts.
- **Rows stagger** seconds between rows; **Irregularity %** extra blocks
  left standing per row and side, more towards the outer rows; **Shape
  seed**; **Top / Bottom / Centre** stagger order (closing runs in reverse).

Right column:

- **Block width** widest edge block left in an open row, in units (one unit
  is the card's short side / 24); the edge blocks breathe between that and
  two units less, never resting. **Block travel** largest sideways step of a
  row's pattern in units. **Block seed**.
- **Floaters** number of floating blocks spread over the open rows (0 =
  none), **Floaters size** largest in units (smallest is half), **Floaters
  travel** largest sideways step in px on the 1080 canvas. They show their
  own stripes, grow, shrink to nothing and back, and drift.
- **Top / Bottom colours** click a swatch for a picker, hover it and press
  Cmd+V to paste a hex (with or without #), `?` picks one of the thirteen
  Touquet pairs.
- **Copy / Paste settings** the whole state as JSON (values are clamped).
- **Export MP4 / PNG**.

Preview:

- Drag the artist block group up or down to place it (vertical only, saved
  in the settings as `labelY`).
- Drag the photo to reposition it; scroll over the card to zoom it about the
  pointer; scroll outside the card to resize the preview.
- The timeline under the card: click the frame number or press Space to
  play / pause, drag the ticks to scrub, arrow keys step one frame (Shift:
  ten), Home restarts.

Hidden defaults (no UI, set via paste settings): `focus` (which half starts
with 3-unit stripes, default bottom), `moveMin` / `moveMax` (1.8 / 3.6 s
block keyframe spacing), `floatMoveMin` / `floatMoveMax` (1 / 2.5 s), the
easing `cubic-bezier(0.70, 0.10, 0.10, 0.90)` measured on the reference.

## Model

Every row's pattern is never still: its stripe width glides between 1, 2
and 3 units and the whole pattern drifts sideways, both as chains of
easy-eased keyframes with random spacing, joined by the opening easing. The
stripe chain starts a transition with the row's opening and returns to the
closed width with its closing; the drift chain runs free and seamless. The
pattern scales about a seeded point away from the seam, so left and right
halves move differently. The edge blocks of an open row have their own
integer chain.

`analysis/` holds the scripts used to measure the original reference video.
