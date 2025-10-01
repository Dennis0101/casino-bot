// 결과: 'player' | 'banker' | 'tie'
// 배당 예시: Player 2.0, Banker 1.95, Tie 8.0
export function settleBaccarat(bets, result) {
  return bets.map(b => {
    const won = (b.side === result);
    let odds = 0;
    if (result === 'player') odds = 2.0;
    if (result === 'banker') odds = 1.95;
    if (result === 'tie') odds = 8.0;
    const delta = won ? Math.round(b.amount * (odds - 1)) : -b.amount;
    return { userId: b.userId, delta, odds, outcome: won ? result.toUpperCase() : 'LOSE' };
  });
}
