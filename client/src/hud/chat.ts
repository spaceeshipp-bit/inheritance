// Typed chat: Enter opens a box, Enter sends (a bubble over your head), Esc cancels.
import { el } from '../util.js';

export class ChatBox {
  readonly root = el('div', 'chatbox');
  private input = el('input', 'chat-input');
  isOpen = false;
  onSend: (text: string) => void = () => {};
  onClose: () => void = () => {};

  constructor() {
    const label = el('span', 'chat-label', 'Say:');
    this.input.maxLength = 120;
    this.input.placeholder = 'Enter to send, Esc to cancel';
    this.root.append(label, this.input);
    this.root.style.display = 'none';
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const t = this.input.value.trim();
        if (t) this.onSend(t);
        this.close();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        this.close();
        e.preventDefault();
      }
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('blur', () => { if (this.isOpen) this.close(); });
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.input.value = '';
    this.root.style.display = '';
    setTimeout(() => this.input.focus(), 0);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.style.display = 'none';
    this.input.blur();
    this.onClose();
  }
}
