// The one DOM binding for the scrub slider: no drawing, no clock. The slider
// reports every move; letting go of a drag, or the "now" button, snaps back to 0.
import { clampScrub } from './scrub.js';

export class ScrubBar {
  constructor(input, nowBtn, { onChange } = {}) {
    this.input = input;
    this.nowBtn = nowBtn;
    this.onChange = typeof onChange === 'function' ? onChange : () => {};
    input.addEventListener('input', () => this.onChange(clampScrub(Number(input.value))));
    // Capture the pointer on press so a release anywhere still reaches the slider.
    input.addEventListener('pointerdown', (e) => {
      if (typeof input.setPointerCapture === 'function') input.setPointerCapture(e.pointerId);
    });
    // A released drag returns to now. Keys do not: keyboard users have "now",
    // Home and Escape, so keyup deliberately does nothing.
    for (const type of ['pointerup', 'pointercancel', 'touchend', 'mouseup']) {
      input.addEventListener(type, () => this.reset());
    }
    nowBtn.addEventListener('click', () => this.reset());
  }

  reset() {
    this.input.value = '0';
    this.onChange(0);
  }

  setValue(min) {
    this.input.value = String(clampScrub(min));
  }

  setValueText(text) {
    this.input.setAttribute('aria-valuetext', text);
  }

  show(on) {
    const row = this.input.parentElement;
    if (row) row.hidden = !on;
  }
}
