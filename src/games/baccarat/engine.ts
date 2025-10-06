// src/utils/timer.ts
import { EmbedBuilder, Message } from "discord.js";

/** 진행바 문자열 */
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
  /** 완료 시 컴포넌트 제거 (기본 false) */
  disableComponentsOnFinish?: boolean;
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
 * 메시지 하나를 1초(또는 지정 간격)로 갱신하며 카운트다운을 표시.
 * - 완료 시 onFinish 실행
 * - 옵션으로 종료 시 컴포넌트 제거/메시지 삭제 가능
 * - 취소/상태확인 핸들 반환
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
      // 메시지가 삭제되었거나 권한 문제 → 타이머 정리 후 종료
      clearTimer();
      finished = true;
    }
  };

  // 종료 시 버튼/셀렉트 등 컴포넌트 전부 제거(비활성화와 동일한 효과, 타입충돌 없음)
  const removeAllComponents = async () => {
    try {
      await msg.edit({ components: [] });
    } catch {
      /* 무시 */
    }
  };

  const tick = async () => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const remain = Math.max(0, total - elapsed);

    if (finished) return;

    await safeEdit({ embeds: [baseEmbed(remain)] });

    if (opts.onTick) {
      try {
        await opts.onTick(remain, elapsed);
      } catch {
        /* 무시 */
      }
    }

    if (remain <= 0) {
      finished = true;
      clearTimer();

      if (opts.disableComponentsOnFinish) {
        await removeAllComponents();
      }

      try {
        await onFinish();
      } catch {
        /* 무시 */
      }

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

  // 첫 렌더 후 루프 시작
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
