// Lantern mode: fill the screen and keep the display awake, so a spare phone
// or tablet can stand on a shelf showing the jars all day. Memory state only
// (nothing is stored); every browser dependency is injected so node --test can
// drive it with fakes. The mode is on because the page was launched from a
// home screen (standalone) or because the viewer pressed the button this time.

const query = (matchMedia, q) => {
  try { return !!(matchMedia && matchMedia(q) && matchMedia(q).matches); } catch { return false; }
};

export function isStandalone({ matchMedia, navigator } = {}) {
  return query(matchMedia, '(display-mode: standalone)')
    || query(matchMedia, '(display-mode: fullscreen)')
    || navigator?.standalone === true;
}

export function capabilities({ document, navigator } = {}) {
  return {
    fullscreen: document?.fullscreenEnabled !== false && typeof document?.documentElement?.requestFullscreen === 'function',
    wakeLock: typeof navigator?.wakeLock?.request === 'function',
  };
}

export class Lantern {
  constructor({ document, navigator, matchMedia }) {
    this.document = document;
    this.navigator = navigator;
    this.standalone = isStandalone({ matchMedia, navigator });
    this.supports = capabilities({ document, navigator });
    this.active = this.standalone;
    this.state = this.supports.wakeLock ? 'idle' : 'unsupported';
    this.sentinel = null;
    this.pending = null;
  }

  get on() { return this.active; }
  get lock() { return this.state; }

  attach() {
    const doc = this.document;
    const onVisibility = () => {
      if (doc.visibilityState === 'hidden') this.releaseLock();
      else if (this.active) this.holdLock();
    };
    const onFullscreen = () => {
      if (!doc.fullscreenElement && !this.standalone && this.active) this.leave();
    };
    doc.addEventListener('visibilitychange', onVisibility);
    doc.addEventListener('fullscreenchange', onFullscreen);
    if (this.active) this.holdLock();
    return () => {
      doc.removeEventListener('visibilitychange', onVisibility);
      doc.removeEventListener('fullscreenchange', onFullscreen);
    };
  }

  toggle() { return this.active ? this.leave() : this.enter(); }

  async enter() {
    this.active = true;
    const doc = this.document;
    if (this.supports.fullscreen && !this.standalone && !doc.fullscreenElement) {
      try { await doc.documentElement.requestFullscreen(); } catch { /* needs a gesture; the lock is still worth holding */ }
      if (!this.active) {
        // leave() landed while the request was pending: do not stay fullscreen
        if (doc.fullscreenElement) { try { await doc.exitFullscreen(); } catch { /* already out */ } }
        return;
      }
    }
    await this.holdLock();
  }

  async leave() {
    this.active = false;
    await this.releaseLock();
    const doc = this.document;
    if (doc.fullscreenElement) {
      try { await doc.exitFullscreen(); } catch { /* already out */ }
    }
  }

  holdLock() {
    if (!this.active || !this.supports.wakeLock || this.document.visibilityState !== 'visible' || this.sentinel) {
      return this.pending || Promise.resolve();
    }
    if (this.pending) return this.pending;
    this.pending = (async () => {
      try {
        const sentinel = await this.navigator.wakeLock.request('screen');
        if (!this.active || this.document.visibilityState !== 'visible') {
          // the mode went off (or the page was hidden) while the request was pending: let it go at once
          try { await sentinel.release(); } catch { /* the browser already dropped it */ }
          return;
        }
        this.sentinel = sentinel;
        this.state = 'held';
        sentinel.addEventListener?.('release', () => {
          if (this.sentinel === sentinel) this.sentinel = null;
          if (this.state === 'held') this.state = 'idle';
        });
      } catch {
        if (this.active) this.state = 'denied';
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }

  async releaseLock() {
    const sentinel = this.sentinel;
    this.sentinel = null;
    this.state = this.supports.wakeLock ? 'idle' : 'unsupported';
    try { await sentinel?.release(); } catch { /* the browser already dropped it */ }
  }
}
