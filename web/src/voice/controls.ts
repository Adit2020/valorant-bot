import type { Conversation } from './conversation.js';

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}

export function bindPushToTalk(button: HTMLButtonElement, conversation: Conversation): () => void {
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let control: 'keyboard' | 'pointer' | null = null;
  const cancel = () => {
    control = null;
    conversation.cancel();
  };
  window.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
    if (event.target instanceof Element && event.target.closest('button') && event.target !== button) return;
    event.preventDefault();
    if (control) return;
    control = 'keyboard';
    conversation.beginListening();
  }, options);
  window.addEventListener('keyup', event => {
    if (event.code !== 'Space' || control !== 'keyboard') return;
    event.preventDefault();
    control = null;
    conversation.release();
  }, options);
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || control) return;
    event.preventDefault();
    control = 'pointer';
    button.setPointerCapture(event.pointerId);
    conversation.beginListening();
  }, options);
  button.addEventListener('pointerup', event => {
    if (control !== 'pointer') return;
    control = null;
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    conversation.release();
  }, options);
  button.addEventListener('pointercancel', () => { if (control === 'pointer') cancel(); }, options);
  button.addEventListener('lostpointercapture', () => { if (control === 'pointer') cancel(); }, options);
  window.addEventListener('blur', cancel, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); }, options);
  return () => { listeners.abort(); cancel(); };
}
