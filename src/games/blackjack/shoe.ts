import type { Card, Rank, Suit } from './engine.js';

const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS: Suit[] = ['S','H','D','C'];

function deck(): Card[] {
  const d: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) d.push({ r, s });
  return d;
}
function shuffle<T>(a: T[]) { for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

export function buildShoe(decks = 6){ let shoe: Card[] = []; for (let i=0;i<decks;i++) shoe=shoe.concat(deck()); return shuffle(shoe); }
export function draw(shoe: Card[]){ return shoe.shift(); }
export function needReshuffle(shoe: Card[], threshold=0.25){ return shoe.length < 52*6*threshold; }
