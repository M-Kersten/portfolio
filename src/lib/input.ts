// Whether the last thing the visitor did was on the keyboard.
//
// Focus the page moves by itself (into a dialog as it opens) wants to land on
// a control for someone tabbing through, who then sees where they are. After a
// click, or on a page that opens straight onto a dialog, the same move puts a
// focus ring on a button nobody chose, which reads as a stray highlight: there
// the dialog itself takes the focus, and shows none.
let keyed = false;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.metaKey && !e.ctrlKey && !e.altKey) keyed = true;
    },
    true,
  );
  window.addEventListener('pointerdown', () => (keyed = false), true);
}

export const byKeyboard = () => keyed;
