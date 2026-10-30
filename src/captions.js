// Captions for the spoken callouts (0117): the words audio.js says (GPWS altitudes, sink
// rate / pull up, retard, the stabilized gate, gear, windshear) on one line of text, shown
// for CAPTION_HOLD_S whether or not sound is on. Pure: `show(text)` is the only side effect,
// called when the line changes ('' clears it), never per frame.
export const CAPTION_HOLD_S = 1.2;

export function createCaption(show, holdS = CAPTION_HOLD_S) {
  let text = '';
  let last = '';
  let until = -1;
  return {
    // A call that queues behind the one being said (interrupt false in audio.js) joins it on
    // the line; one that cuts it off replaces it. The same words again inside the window are
    // ignored, so a repeated call doesn't keep the line up.
    say(words, now, queued = false) {
      if (!words || (words === last && now < until)) return;
      text = queued && now < until ? `${text} · ${words}` : words;
      last = words;
      until = now + holdS;
      show(text);
    },
    update(now) {
      if (text && now >= until) { text = ''; show(''); }
    },
    get text() { return text; },
  };
}
