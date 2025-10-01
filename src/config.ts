// src/config.ts
type Num = number | string | undefined | null;

const toInt = (v: Num, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
};
const toFloat = (v: Num, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const toBool = (v: string | undefined, d: boolean) => {
  if (v == null) return d;
  const s = v.toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return d;
};

// ── 기본값 (안전하게 보수적으로)
const DEFAULTS = {
  DAILY_BONUS: 500,

  // Blackjack
  BJ_BET_SEC: 20,
  BJ_ACT_SEC: 15,
  BJ_DECKS: 6,
  BJ_MIN_PLAYERS: 2,
  BJ_MAX_PLAYERS: 6,

  // Baccarat
  BAC_BET_SEC: 25,
  BAC_DECKS: 8,

  // Payouts (총지급 배수; 원금 포함)
  PAYOUT_PLAYER: 2.0,   // 1:1
  PAYOUT_BANKER: 1.95,  // 19:20 (5% 커미션 반영)
  PAYOUT_TIE: 9.0,      // 8.0 or 9.0 취향에 맞게
  PAYOUT_PLAYER_PAIR: 12.0, // 11:1
  PAYOUT_BANKER_PAIR: 12.0,

  // 기타
  LOG_LEVEL: "info",
};

// ── 환경변수 → CFG 매핑
export const CFG = {
  // ===== 공통/경제 =====
  DAILY_BONUS: toInt(process.env.CASINO_DAILY_BONUS, DEFAULTS.DAILY_BONUS),

  // ===== Blackjack =====
  // 새 이름 우선, 구이름(BJ_*)도 백업으로 인식
  BJ_BET_SEC: toInt(
    process.env.BLACKJACK_BET_SECONDS ?? process.env.BJ_BET_SEC,
    DEFAULTS.BJ_BET_SEC
  ),
  BJ_ACT_SEC: toInt(
    process.env.BLACKJACK_ACTION_SECONDS ?? process.env.BJ_ACT_SEC,
    DEFAULTS.BJ_ACT_SEC
  ),
  BJ_DECKS: toInt(
    process.env.BLACKJACK_DECKS ?? process.env.BJ_DECKS,
    DEFAULTS.BJ_DECKS
  ),
  BJ_MIN_PLAYERS: toInt(process.env.BLACKJACK_MIN_PLAYERS, DEFAULTS.BJ_MIN_PLAYERS),
  BJ_MAX_PLAYERS: toInt(process.env.BLACKJACK_MAX_PLAYERS, DEFAULTS.BJ_MAX_PLAYERS),

  // ===== Baccarat =====
  BAC_BET_SEC: toInt(
    process.env.BACCARAT_BET_SECONDS ?? process.env.BAC_BET_SEC,
    DEFAULTS.BAC_BET_SEC
  ),
  BAC_DECKS: toInt(
    process.env.BACCARAT_DECKS ?? process.env.BAC_DECKS,
    DEFAULTS.BAC_DECKS
  ),

  // ===== Payouts (필요시 환경변수로 조절 가능) =====
  PAYOUTS: {
    // 메인
    PLAYER: toFloat(process.env.BACCARAT_PAYOUT_PLAYER, DEFAULTS.PAYOUT_PLAYER),
    BANKER: toFloat(process.env.BACCARAT_PAYOUT_BANKER, DEFAULTS.PAYOUT_BANKER),
    TIE:    toFloat(process.env.BACCARAT_PAYOUT_TIE,    DEFAULTS.PAYOUT_TIE),
    // 사이드
    PLAYER_PAIR: toFloat(process.env.BACCARAT_PAYOUT_PLAYER_PAIR, DEFAULTS.PAYOUT_PLAYER_PAIR),
    BANKER_PAIR: toFloat(process.env.BACCARAT_PAYOUT_BANKER_PAIR, DEFAULTS.PAYOUT_BANKER_PAIR),
  },

  // ===== 로깅/기타 =====
  LOG_LEVEL: process.env.LOG_LEVEL ?? DEFAULTS.LOG_LEVEL,

  // ===== 로비 채널 (필수 값은 아님: index.ts에서 체크) =====
  LOBBY_CHANNEL_ID: process.env.LOBBY_CHANNEL_ID,
};

// ── 하위호환을 위해 별칭도 제공 (기존 코드 보호)
export const BAC_DECKS = CFG.BAC_DECKS;
export const BJ_DECKS = CFG.BJ_DECKS;
export const BAC_BET_SEC = CFG.BAC_BET_SEC;
export const BJ_BET_SEC = CFG.BJ_BET_SEC;
export const BJ_ACT_SEC = CFG.BJ_ACT_SEC;
export const DAILY_BONUS = CFG.DAILY_BONUS;
