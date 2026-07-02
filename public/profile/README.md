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
