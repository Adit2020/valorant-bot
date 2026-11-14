export function wordAt(text: string, charIndex: number): number {
  const starts = [...text.matchAll(/\S+/gu)].map(match => match.index);
  return Math.max(0, starts.findIndex((start,i) => charIndex >= start && (starts[i+1] === undefined || charIndex < starts[i+1]!)));
}
export function estimatedWord(count: number, elapsed: number, duration: number): number {
  return Math.min(count - 1, Math.max(0, Math.floor(elapsed / Math.max(.1,duration) * count)));
}
export class Subtitles {
  private text = '';
  private words: HTMLSpanElement[] = [];
  private highlighted = -1;
  private fade?: ReturnType<typeof setTimeout>;
  private finished = false;
  constructor(private element: HTMLElement) {}
  show(text: string) {
    if (this.text === text) return;
    this.clear(); this.text = text; this.finished = false;
    this.element.setAttribute('aria-label', text);
    this.words = text.split(/\s+/u).filter(Boolean).map(word => {
      const span = document.createElement('span'); span.textContent = word + ' '; return span;
    });
    this.element.replaceChildren(...this.words);
    this.element.classList.remove('faded');
  }
  highlight(index: number) {
    if (index === this.highlighted) return;
    this.words[this.highlighted]?.classList.remove('current');
    this.words[index]?.classList.add('current'); this.highlighted = index;
  }
  finish() {
    if (this.finished || !this.text) return;
    this.finished = true; this.highlight(-1);
    this.fade = setTimeout(() => this.element.classList.add('faded'), 3000);
  }
  clear() {
    clearTimeout(this.fade); this.text = ''; this.words = []; this.highlighted = -1; this.finished = false;
    this.element.replaceChildren(); this.element.removeAttribute('aria-label'); this.element.classList.remove('faded');
  }
  dispose() { clearTimeout(this.fade); }
}
