# Stills

A project's pictures: the ones that float behind its story when it's opened
from the chronology, the collection or search.

One folder per project, named after its slug, with pictures in it
(`.jpg`, `.png` or `.webp`), shown in file-name order:

```
src/assets/stills/arcam/1.jpg
src/assets/stills/arcam/2.jpg
```

A project with a gallery (`gallery` in `cases.json`) shows those pictures
first. Up to six float on a wide screen and three on a phone. The first hangs
by the film, in colour; the next go further out and further back, smaller and
paler, the last of them grey. So put the best ones first.

`npm run stills` fills a folder that is still empty with three frames from the
project's film (the script's own header has the details). They are whatever
was on screen at those moments, so look at them before committing: delete a
frame that shows nothing of the work, or put a better picture in its place.
A folder that already holds pictures is never touched again.

About 800 px wide is plenty.
