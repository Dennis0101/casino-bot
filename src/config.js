export const CFG = {
  DAILY_BONUS: Number(process.env.CASINO_DAILY_BONUS ?? 500),
  BJ_BET_SEC:  Number(process.env.BLACKJACK_BET_SECONDS ?? 20),
  BJ_ACT_SEC:  Number(process.env.BLACKJACK_ACTION_SECONDS ?? 15),
  BAC_BET_SEC: Number(process.env.BACCARAT_BET_SECONDS ?? 15)
};
