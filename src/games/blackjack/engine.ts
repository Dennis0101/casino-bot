export type Suit = 'S'|'H'|'D'|'C';
export type Rank = 'A'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K';
export type Card = { r: Rank, s: Suit };
export type Hand = Card[];

export const value = (hand: Hand) => {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.r === 'A') { aces++; total += 11; }
    else if (c.r==='K' || c.r==='Q' || c.r==='J' || c.r==='10') total += 10;
    else total += Number(c.r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
};

export const isBJ = (hand: Hand) => hand.length === 2 && value(hand) === 21;

// TODO: 아래 함수들은 tableManager에서 연결되도록 점진 구현
// export function initRound(...){}
// export function applyAction(...){}
// export function playDealer(...){}
// export function settle(...){}
