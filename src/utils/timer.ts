// src/utils/timer.ts
import { EmbedBuilder, Message } from "discord.js";

function bar(p: number, slots = 10) {
  const clamped = Math.min(1, Math.max(0, p));
  const filled = Math.round(clamped * slots);
  return "█".repeat(filled) + "░".repeat(slots - filled);
}

export type CountdownOptions = {
  /** 진행바 칸 수 (기본 10칸) */
  slots?: number;
  /** 틱 간격(ms). 기본 1000ms */
  tickMs?: number;
  /** 매 틱마다 호출 (remain: 남은초, elapsed: 경과초) */
  onTick?: (remain: number, elapsed: number) => Promise<void> | void;
  /** 완료 시 메시지 삭제 (기본 false) */
  deleteOnFinish?: boolean;
  /** 완료 시 컴포넌트 전부 제거 (기본 false) */
  clearComponentsOnFinish?: boolean;
  /** 임베드 footer 텍스트 */
  footer?: string;
  /** 임베드 색상 (정수 또는 HEX) */
  color?: number;
};

export type CountdownHandle = {
  /** 타이머 취소 */
  cancel: () => void;
  /** 남은 초 조회 */
  getRemaining: () => number;
  /** 이미 끝났는지 */
  isFinished: () => boolean;
};

/**
 * 메시지 하나를 1초/또는 지정 간격으로 갱신하며 카운트다운을 표시.
 * - 완료 시 onFinish 호출
 * - 옵션으로 컴포넌트 제거/삭제 가능
 * - 취소 핸들 제공
 */
export async function runCountdownEmbed(
  msg: Message,
  sec: number,
  title: string,
  onFinish: () => Promise<void> | void,
  opts: CountdownOptions = {}
): Promise<CountdownHandle> {
  const total = Math.max(1, Math.floor(sec || 0));
  const tickMs = Math.max(250, Math.floor(opts.tickMs ?? 1000));
  const slots = Math.max(5, Math.floor(opts.slots ?? 10));

  let finished = false;
  let timer: NodeJS.Timeout | null = null;

  const start = Date.now();

  const baseEmbed = (remain: number) => {
    const progress = 1 - remain / total;
    const emb = new EmbedBuilder()
      .setTitle(title)
      .setDescription(
        [`⏱️ **${remain}s** 남음`, "", `\`${bar(progress, slots)}\``].join("\n")
      );

    if (opts.footer) emb.setFooter({ text: opts.footer });
    if (opts.color !== undefined) emb.setColor(opts.color);

    return emb;
  };

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const safeEdit = async (payload: Parameters<Message["edit"]>[0]) => {
    try {
      await msg.edit(payload);
    } catch {
      // 메시지가 삭제되었거나 권한 문제 등: 타이머 정리만 하고 종료
      clearTimer();
      finished = true;
    }
  };

  const tick = async () => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const remain = Math.max(0, total - elapsed);

    if (finished) return;

    await safeEdit({ embeds: [baseEmbed(remain)] });

    // 사용자 정의 tick 훅
    if (opts.onTick) {
      try {
        await opts.onTick(remain, elapsed);
      } catch {
        /* 훅 에러 무시 */
      }
    }

    if (remain <= 0) {
      finished = true;
      clearTimer();

      // 컴포넌트 전부 제거 (타입 충돌 없이 안전)
      if (opts.clearComponentsOnFinish) {
        try {
          await msg.edit({ components: [] });
        } catch {
          /* 무시 */
        }
      }

      // 완료 콜백
      try {
        await onFinish();
      } catch {
        /* 무시 */
      }

      // 메시지 삭제
      if (opts.deleteOnFinish) {
        try {
          await msg.delete();
        } catch {
          /* 무시 */
        }
      }
      return;
    }

    timer = setTimeout(tick, tickMs);
  };

  // 첫 렌더
  await safeEdit({ embeds: [baseEmbed(total)] });
  timer = setTimeout(tick, tickMs);

  return {
    cancel: () => {
      if (finished) return;
      finished = true;
      clearTimer();
    },
    getRemaining: () => {
      if (finished) return 0;
      const elapsed = Math.floor((Date.now() - start) / 1000);
      return Math.max(0, total - elapsed);
    },
    isFinished: () => finished,
  };
}
