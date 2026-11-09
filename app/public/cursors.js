/** Textarea mirrors preserve native typing and expose collaborators without HTML injection. */
export class CursorLayer {
  constructor(input) {
    this.input = input;
    this.peers = [];
    this.layer = document.createElement('div');
    this.layer.className = 'cursor-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    input.parentElement.append(this.layer);
    input.addEventListener('scroll', () => this.render(this.replica));
    this.observer = new ResizeObserver(() => this.render(this.replica));
    this.observer.observe(input);
  }
  set(peers, replica) {
    this.peers = peers;
    document.getElementById('cursor-users').textContent = peers.length
      ? peers.map((p) => p.name + ' is editing').join(' · ')
      : 'Your personal undo history';
    this.render(replica);
  }
  render(replica) {
    this.replica = replica;
    this.layer.replaceChildren();
    if (!replica || !this.input.clientWidth) return;
    const style = getComputedStyle(this.input);
    for (const peer of this.peers) {
      const range = replica.resolve(peer.cursor);
      if (!range) continue;
      const mirror = document.createElement('div');
      mirror.className = `cursor-mirror cursor-color-${peer.userId % 4}`;
      for (const key of [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'lineHeight',
        'letterSpacing',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'tabSize',
        'textIndent',
      ])
        mirror.style[key] = style[key];
      mirror.style.width = this.input.clientWidth + 'px';
      mirror.style.transform = `translate(${-this.input.scrollLeft}px, ${-this.input.scrollTop}px)`;
      const text = this.input.value;
      const start = Math.min(range.start, range.end),
        end = Math.max(range.start, range.end);
      const selection = document.createElement('span');
      selection.className = 'remote-selection';
      selection.textContent = text.slice(start, end);
      const caret = document.createElement('span');
      caret.className = 'remote-caret';
      const label = document.createElement('span');
      label.className = 'remote-label';
      label.textContent = peer.name;
      caret.append(label);
      mirror.append(
        document.createTextNode(text.slice(0, start)),
        selection,
        caret,
        document.createTextNode(text.slice(end) + '\u200b'),
      );
      this.layer.append(mirror);
    }
  }
}
