export const value = (hand) => {
  // hand: [{r:'A'|'2'..'K', s:'S|H|D|C'}]
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.r==='A') { aces++; total += 11; }
    else if ('KQJ'.includes(c.r)) total += 10;
    else total += Number(c.r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
};

export const isBlackjack = (hand) => hand.length===2 && value(hand)===21;

// TODO:
// - initRound(players, shoe) → 딜/상태 초기화
// - applyAction(round, playerId, 'hit'|'stand'|'double'|'split')
// - playDealer(round)
// - settle(round) → delta 계산
