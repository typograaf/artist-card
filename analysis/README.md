# Reference measurements

Scripts used to measure the reference video (frames extracted with
`ffmpeg -i video.mp4 -vf fps=30 frames/f%03d.png`, run from the folder that
holds `frames/`). They produced the defaults in `src/engine.ts`:

- `colors.py` palette + block run-lengths of the closed card.
- `track.py` per-frame hole extents, pattern shifts and label clip extents
  (`analysis/track.json`), from which the easing `cubic-bezier(0.70, 0.15,
  0.05, 0.80)`, the ~0.13 s stagger and the label fold timings were fitted.
- `widths.py` block width per row over time, which showed the widths animate
  between 1x and 2x (a scale about the seam) rather than jump.

Needs Python 3 with numpy + Pillow. The video and frames are not in the repo.
