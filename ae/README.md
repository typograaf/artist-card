# After Effects version

`build.jsx` builds the artist card as an After Effects comp driven by the same
model as the web tool. `lib.js` is a port of `src/engine.ts` (same seeded
randomness, easing and keyframe chains, verified identical to the pixel in
`scratch` tests); `build.py` generates `build.jsx` from it. AE 2024 or later,
JavaScript expression engine (the script switches the project to it).

## Use

1. In After Effects: File > Scripts > Run Script File > `ae/build.jsx`.
   It adds the comp "Artist card — tool v2" (1080 x 1350, 30 fps) and the
   footage "default photo" to the open project. Running it again replaces
   that comp.
2. **CTRL** layer: every slider of the web tool (Hold closed, Opening time,
   Opening %, Vignette %, Hold open, Rows top / bottom, Rows stagger, Irregularity %,
   Shape seed, Stagger order, Block width / travel / seed, Floaters, Floaters
   size / travel, Label Y %), the **Colourway** slider (1 to 67 locks the
   stripes to one of the Touquet sets, 0 frees the colour controls) and the
   colour controls (Top A/B, Bottom A/B, Label bg, Label text). Same numbers
   as the tool give the same picture.
3. **INPUT** layers (hidden): type the Day, Time start, Time end, Artist and
   Stage. Every word becomes its own block (up to 4 artist words, 3 stage
   and day words); the time is one block, start and end joined by a dash.
4. **IMAGE**: replace the footage with the artist photo; scale and position
   it like any layer.
5. **apply-settings.jsx** (File > Scripts > Run Script File) asks for a tool
   link or the Copy Settings text and sets every slider, colour, text and the
   photo zoom / position in one go.
6. The loop length depends on the settings; the read-only **Loop length (s)**
   slider on CTRL shows it. Set the work area to that length. Playback loops
   with comp time.

The label blocks need Avantt Bold installed (PostScript name `Avantt-Bold`).
Frames take about a second to render: most of the cost is the expression
library, which is evaluated by two controls per row, floater and word block
(WE / WIN and BLK / BLK2) and read by everything else.

`python3 build.py [diagnostics folder]` regenerates `build.jsx`; the script
renders a diagnostics sheet and four check frames into that folder (default:
the system temp folder).
