export type BacSide = 'player'|'banker'|'tie';
export function odds(side: BacSide){ return side==='player'?2.0: side==='banker'?1.95: 8.0; }
export function settleBets(bets: { userId: string; amount: number; side: BacSide }[], result: BacSide) {
  return bets.map(b => {
    const won = b.side === result;
    const o = odds(result);
    const delta = won ? Math.round(b.amount * (o - 1)) : -b.amount;
    return { userId: b.userId, delta, odds: won ? o : 0, outcome: won ? result.toUpperCase() : 'LOSE' };
  });
}
