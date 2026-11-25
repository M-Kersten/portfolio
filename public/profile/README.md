# Profile photos

Five portrait photos live here, named:

    1.png  2.png  3.png  4.png  5.png

They are cycled through by scroll position in the About section — the portrait
scrubs from `1` up to `5`, landing on `5` when it reaches the middle of the
screen. `5.png` is the "final" shot it holds on.

Portrait crop works best (the frame is 4:5, `background-size: cover`, anchored to
the top so faces aren't cut off). To change how many photos cycle, edit
`PORTRAITS` in `About.tsx`; to change the file type, edit the `background-image`
path there.

## The last photo's depth

`5.png` is shown in relief: its dots become a point cloud that turns to look at
the cursor (`src/components/home/PortraitRelief.tsx`). The depth comes from
`depth.png`, a small greyscale picture of the same photo in which white is
nearest and black is the back plane.

After changing `5.png`, make a new one: `scripts/portrait-depth.py` (the steps
are at the top of that file; it runs on your own machine). It prints the figure
to set `DEPTH` to in `PortraitRelief.tsx`. A depth map from any other tool works
too, or one painted by hand, as long as it lines up with the photo. Without a
`depth.png` the photo simply stays flat.

For the relief `5.png` has to stay what it is now: light dots on a transparent
background.
