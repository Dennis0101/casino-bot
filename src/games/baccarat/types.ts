export type SideKey = "PLAYER_PAIR" | "BANKER_PAIR";
export type MainKey = "PLAYER" | "BANKER" | "TIE";

export type BetsBucket = {
  main: Record<string, Partial<Record<MainKey, number>>>;
  side: Record<string, Partial<Record<SideKey, number>>>;
};

export type LastTarget = Record<string, { kind: "MAIN" | "SIDE"; key: MainKey | SideKey }>;

export type BacState =
  | { phase: "BETTING"; until: number; bets: BetsBucket; lastTarget: LastTarget }
  | { phase: "DEALING"; P: string[]; B: string[]; bets: BetsBucket }
  | { phase: "SHOW"; P: string[]; B: string[]; bets: BetsBucket }
  | { phase: "SETTLE" | "COOLDOWN"; until?: number };
