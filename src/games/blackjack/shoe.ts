export function buildShoe(decks = 6) {
  const cards: string[] = [];
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const suits = ['♠','♥','♦','♣'];
  for (let d=0; d<decks; d++) for (const r of ranks) for (const s of suits) cards.push(`${r}${s}`);
  // shuffle
  for (let i=cards.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [cards[i],cards[j]]=[cards[j],cards[i]];
  }
  return cards;
}
export function valueOf(hand: string[]) {
  let total=0, aces=0;
  for (const c of hand){
    const r=c.replace(/[♠♥♦♣]/g,'');
    if (r==='A'){ aces++; total+=11; }
    else if (['J','Q','K','10'].includes(r)) total+=10;
    else total+=Number(r);
  }
  while(total>21 && aces>0){ total-=10; aces--; }
  return total;
}
