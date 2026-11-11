/** Tiny deterministic DOM for lifecycle tests; deliberately no rendering/browser emulation. */
export class TestNode {
  parentNode: TestNode | null = null;
  childNodes: TestNode[] = [];
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  className = ''; tagName: string; nodeText = '';
  value = ''; name = ''; type = ''; disabled = false; checked = false;
  placeholder = ''; min = ''; max = ''; maxLength = 0; step = ''; required = false;
  selectionStart: number | null = null; selectionEnd: number | null = null;
  open = false; scrollTop = 0; scrollHeight = 0; tabIndex = 0; width = 0; height = 0; draggable = false;
  onclick: ((event: any) => void) | null = null;
  oninput: ((event: any) => void) | null = null;
  onchange: ((event: any) => void) | null = null;
  onsubmit: ((event: any) => void) | null = null;
  onkeydown: ((event: any) => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  owner: TestDocument;
  /** Opt-in (TestDocument.connected): attached to a registered root, as a page's DOM is; otherwise unknown. */
  get isConnected(): boolean | undefined { const roots = this.owner.connected; if (!roots) return undefined; let n: TestNode = this; while (n.parentNode) n = n.parentNode; return roots.has(n); }
  constructor(tag: string, owner: TestDocument) { this.tagName = tag.toUpperCase(); this.owner = owner; }
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void { let entries = this.listeners.get(type); if (!entries) this.listeners.set(type, entries = new Set()); entries.add(listener); }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void { this.listeners.get(type)?.delete(listener); }
  dispatchEvent(event: Event): boolean { for (const listener of this.listeners.get(event.type) ?? []) { if (typeof listener === 'function') listener(event); else listener.handleEvent(event); } return true; }
  append(...nodes: (TestNode | string)[]): void { for (const n of nodes) { const child = typeof n === 'string' ? this.owner.createTextNode(n) : n; child.remove(); child.parentNode = this; this.childNodes.push(child); } }
  prepend(...nodes: TestNode[]): void { for (const n of nodes.reverse()) { n.remove(); n.parentNode = this; this.childNodes.unshift(n); } }
  replaceChildren(...nodes: TestNode[]): void { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; this.append(...nodes); }
  remove(): void { if (this.parentNode) { this.parentNode.childNodes = this.parentNode.childNodes.filter(n => n !== this); this.parentNode = null; } }
  contains(node: TestNode | null): boolean { return node === this || this.childNodes.some(n => n.contains(node)); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  removeAttribute(name: string): void { this.attributes.delete(name); if (name === 'src') (this as unknown as { src: string }).src = ''; }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  get textContent(): string { return this.nodeText + this.childNodes.map(c => c.textContent).join(''); }
  set textContent(text: string) { this.nodeText = text; this.replaceChildren(); }
  get options(): TestNode[] { return this.childNodes.filter(c => c.tagName === 'OPTION'); }
  querySelectorAll(selector: string): TestNode[] {
    const descendants = this.childNodes.flatMap(c => [c, ...c.querySelectorAll('*')]);
    if (selector === '*') return descendants;
    if (selector === '[data-key]') return descendants.filter(c => c.dataset.key);
    return descendants.filter(c => c.tagName.toLowerCase() === selector.toLowerCase());
  }
  /** The first descendant matching `.class` or `tag` (only the simple selectors the client uses). */
  querySelector(selector: string): TestNode | null {
    const all = this.querySelectorAll('*');
    if (selector.startsWith('.')) return all.find(c => c.className.split(' ').includes(selector.slice(1))) ?? null;
    return this.querySelectorAll(selector)[0] ?? null;
  }
  focus(): void { this.owner.activeElement = this; }
  setSelectionRange(start: number, end: number): void { this.selectionStart = start; this.selectionEnd = end; }
  getContext(): null { return null; }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } { return { left: 0, top: 0, width: 1024, height: 768 }; }
}
export class TestDocument {
  activeElement: TestNode | null = null;
  /** The roots a test treats as on the page (null: isConnected stays undefined). */
  connected: Set<TestNode> | null = null;
  createElement(tag: string): TestNode { return new TestNode(tag, this); }
  createTextNode(text: string): TestNode { const node = new TestNode('#text', this); node.nodeText = text; return node; }
}
export function findButton(root: TestNode, text: string): TestNode {
  const node = root.querySelectorAll('button').find(n => n.textContent === text);
  if (!node) throw new Error(`Button not found: ${text}`);
  return node;
}
