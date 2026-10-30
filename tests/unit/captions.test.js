import { describe, it, expect } from 'vitest';
import { createCaption, CAPTION_HOLD_S, plainCaption } from '../../src/captions.js';

const recorder = () => {
  const shown = [];
  return { shown, cap: createCaption((t) => shown.push(t)) };
};

describe('createCaption (0117)', () => {
  it('shows a callout, then clears it after ~1.2 s', () => {
    const { shown, cap } = recorder();
    expect(CAPTION_HOLD_S).toBe(1.2);
    cap.say('five hundred', 10);
    expect(cap.text).toBe('five hundred');
    cap.update(11.1);
    expect(cap.text).toBe('five hundred');
    cap.update(11.2);
    expect(cap.text).toBe('');
    expect(shown).toEqual(['five hundred', '']);
  });

  it('touches the line only when it changes', () => {
    const { shown, cap } = recorder();
    cap.say('fifty', 0);
    for (let t = 0; t < 3; t += 1 / 60) cap.update(t);
    expect(shown).toEqual(['fifty', '']);
  });

  it('ignores the same words again inside the window', () => {
    const { shown, cap } = recorder();
    cap.say('sink rate', 0);
    cap.say('sink rate', 1);
    cap.update(1.25);
    expect(cap.text).toBe('');
    expect(shown).toEqual(['sink rate', '']);
    cap.say('sink rate', 3); // after the window it shows again
    expect(cap.text).toBe('sink rate');
  });

  it('a call that cuts the last one off replaces it', () => {
    const { cap } = recorder();
    cap.say('four hundred', 0);
    cap.say('three hundred', 0.5);
    expect(cap.text).toBe('three hundred');
  });

  it('a queued call joins the one still showing and holds the line for its own window', () => {
    const { cap } = recorder();
    cap.say('twenty', 0);
    cap.say('retard', 0.1, true);
    expect(cap.text).toBe('twenty · retard');
    cap.update(1.25);
    expect(cap.text).toBe('twenty · retard');
    cap.update(1.3);
    expect(cap.text).toBe('');
    cap.say('unstabilized, go around', 5, true); // nothing showing: it stands alone
    expect(cap.text).toBe('unstabilized, go around');
  });

  it('ignores empty words', () => {
    const { shown, cap } = recorder();
    cap.say('', 0);
    expect(shown).toEqual([]);
  });
});

describe('plainCaption (0117 panel)', () => {
  it('gives Kid and Learner plain words for the jargon, and leaves the rest', () => {
    expect(plainCaption('retard')).toBe('throttle idle');
    expect(plainCaption('sink rate')).toBe('sink rate · too fast down');
    expect(plainCaption('too low, gear')).toBe('too low, gear · gear down');
    expect(plainCaption('five hundred')).toBe('five hundred');
  });
});
