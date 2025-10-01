const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['S','H','D','C'];

function deck() {
  const d=[]; for (const r of RANKS) for (const s of SUITS) d.push({ r, s });
  return d;
}
function shuffle(a) { for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

export function buildShoe(decks=6){ let shoe=[]; for (let i=0;i<decks;i++) shoe=shoe.concat(deck()); return shuffle(shoe); }
export function draw(shoe){ return shoe.shift(); }
export function needReshuffle(shoe, threshold=0.25){ return shoe.length < 52*6*threshold; }
