# Profile photos

Drop your five portrait photos here, named:

    1.jpg  2.jpg  3.jpg  4.jpg  5.jpg

They are cycled through by scroll position in the About section — the portrait
scrubs from `1` up to `5`, landing on `5` when it reaches the middle of the
screen. `5.jpg` is the "final" shot it holds on.

Portrait crop works best (the frame is 4:5, `object-fit: cover`, anchored to the
top so faces aren't cut off). If your files are `.png`/`.webp` instead of
`.jpg`, tell me and I'll switch the extension in `About.tsx`.
