import type { CardView } from '../contracts';
import { RARITY_LABELS } from './card-get';

/** The deck editor's card details: art, name, passcode, type line, stats (monsters only), rarity, the forbidden/limited
 * status, the card's alternate arts (same card, other passcodes) and its text. */
export function limitLabel(card: CardView): string | null {
  if (card.deckAllowed === false) return 'Cannot be used in a deck';
  return card.limit === 0 ? 'Forbidden' : card.limit === 1 ? 'Limited (1)' : card.limit === 2 ? 'Semi-Limited (2)' : null;
}
const isMonster = (card: CardView) => card.type ? !/spell|trap/i.test(card.type) : card.attack !== undefined || card.defense !== undefined;
export function renderCardDetails(card: CardView, deps: { drawCard(card: CardView): HTMLElement; alternates: readonly CardView[]; inspect(card: CardView): void }): HTMLElement[] {
  const p = (text: string, className = 'de-note') => { const node = document.createElement('p'); node.className = className; node.textContent = text; return node; };
  const heading = document.createElement('h3'); heading.textContent = card.name;
  const out: HTMLElement[] = [deps.drawCard(card), heading];
  if (card.passcode !== undefined) out.push(p(`Passcode ${card.passcode}`));
  out.push(p([card.type, card.attribute, card.race, card.level ? `Lv ${card.level}` : ''].filter(v => v !== undefined && v !== '').join(' · ') || 'Card type unavailable'));
  if (isMonster(card)) out.push(p(`ATK ${card.attack ?? '?'} / DEF ${card.defense ?? '?'}`));
  const status = [card.rarity ? `Rarity: ${RARITY_LABELS[card.rarity] ?? card.rarity}` : '', limitLabel(card) ?? ''].filter(Boolean).join(' · ');
  if (status) { const line = p(status); line.dataset.key = 'card-status'; out.push(line); }
  const arts = [...deps.alternates].sort((a, b) => (a.passcode ?? 0) - (b.passcode ?? 0));
  if (arts.length > 1) {
    const row = document.createElement('div'); row.className = 'de-row de-card-arts'; row.dataset.key = 'card-arts';
    const at = arts.findIndex(a => a.passcode === card.passcode);
    row.append(p(`Alternate art ${at + 1} of ${arts.length}`));
    arts.forEach((art, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = String(i + 1); b.disabled = i === at;
      b.setAttribute('aria-label', `Art ${i + 1}, passcode ${art.passcode}${art.owned ? `, owned ×${art.owned}` : ''}`); b.onclick = () => deps.inspect(art); row.append(b);
    });
    out.push(row);
  }
  out.push(p(card.description ?? 'Card description unavailable.', ''));
  return out;
}
