import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindPushToTalk } from './controls.js';
import type { Conversation } from './conversation.js';

class FakeElement extends EventTarget {
  constructor(public typing = false, public button = false) { super(); }
  closest(selector: string) { return selector.startsWith('input') ? (this.typing ? this : null) : (this.button ? this : null); }
  setPointerCapture() {}
  hasPointerCapture() { return true; }
  releasePointerCapture() {}
}
function event(type: string, values: object = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
  return event;
}

test('Space repeats/typing/modifiers, pointer release/cancel, and focus loss are handled', () => {
  const previous = { window: globalThis.window, document: globalThis.document, Element: globalThis.Element };
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { hidden: false });
  Object.assign(globalThis, { window: win, document: doc, Element: FakeElement });
  const calls: string[] = [];
  const conversation = { beginListening() { calls.push('begin'); }, release() { calls.push('release'); }, cancel() { calls.push('cancel'); } };
  const button = new FakeElement(false, true);
  const unbind = bindPushToTalk(button as unknown as HTMLButtonElement, conversation as unknown as Conversation);
  try {
    win.dispatchEvent(event('keydown', { code: 'Space', repeat: true }));
    win.dispatchEvent(event('keydown', { code: 'Space', target: new FakeElement(true) }));
    win.dispatchEvent(event('keydown', { code: 'Space', ctrlKey: true }));
    assert.deepEqual(calls, []);
    win.dispatchEvent(event('keydown', { code: 'Space' }));
    win.dispatchEvent(event('keydown', { code: 'Space', repeat: true }));
    win.dispatchEvent(event('keyup', { code: 'Space' }));
    win.dispatchEvent(event('keyup', { code: 'Space' }));
    assert.deepEqual(calls, ['begin', 'release']);
    calls.length = 0;
    button.dispatchEvent(event('pointerdown', { button: 0, pointerId: 1 }));
    button.dispatchEvent(event('pointerup', { pointerId: 1 }));
    button.dispatchEvent(event('lostpointercapture'));
    assert.deepEqual(calls, ['begin', 'release']);
    calls.length = 0;
    button.dispatchEvent(event('pointerdown', { button: 0 }));
    button.dispatchEvent(event('pointercancel'));
    win.dispatchEvent(event('keydown', { code: 'Space' }));
    win.dispatchEvent(event('blur'));
    assert.deepEqual(calls, ['begin', 'cancel', 'begin', 'cancel']);
    calls.length = 0;
    win.dispatchEvent(event('keydown', { code: 'Space' }));
    doc.hidden = true;
    doc.dispatchEvent(event('visibilitychange'));
    assert.deepEqual(calls, ['begin', 'cancel']);
  } finally { unbind(); Object.assign(globalThis, previous); }
});
