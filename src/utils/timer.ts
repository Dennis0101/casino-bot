import {
  EmbedBuilder,
  Message,
  ActionRowBuilder,
  ButtonBuilder,
  ComponentType,
  type MessageActionRowComponentBuilder,
} from "discord.js";

/** 0~1 비율을 N칸 프로그레스 바로 렌더링 */
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
  /** 완료 시 컴포넌트 비활성화 (기본 false) — 버튼만 처리 */
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
 * 메시지 임베드를 주기적으로 갱신하는 카운트다운.
 * - 버튼/컴포넌트는 건드리지 않다가, 옵션 시 완료 때만 일괄 비활성화
 * - 안전 편집(safeEdit)로 삭제/권한 오류에도 크래시 방지
 * - 취소 핸들 반환
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
      // 메시지가 삭제/권한문제 등으로 수정 불가 → 조용히 종료
      clearTimer();
      finished = true;
    }
  };

  const disableAllButtons = async () => {
    // 버튼만 사용한다는 전제(현재 UI). 버튼이 없다면 무시.
    if (!msg.components?.length) return;

    try {
      const rows = msg.components.map((row) => {
        // 기존 Row를 Builder로 변환
        const rowBuilder = new ActionRowBuilder<MessageActionRowComponentBuilder>();
        // 버튼만 비활성화
        for (const comp of row.components) {
          if (comp.type === ComponentType.Button) {
            rowBuilder.addComponents(ButtonBuilder.from(comp).setDisabled(true));
          } else {
            // 버튼 외 컴포넌트는 원형 유지(그대로 복사)
            // toJSON() -> Builder.from()이 없는 타입일 수 있어 제외
          }
        }
        return rowBuilder;
      });

      await msg.edit({ components: rows });
    } catch {
      // 편집 실패는 조용히 무시
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
        /* onTick 에러 무시 */
      }
    }

    if (remain <= 0) {
      finished = true;
      clearTimer();

      if (opts.disableComponentsOnFinish) {
        await disableAllButtons();
      }

      try {
        await onFinish();
      } catch {
        /* onFinish 에러 무시 */
      }

      if (opts.deleteOnFinish) {
        try {
          await msg.delete();
        } catch {
          /* 삭제 실패 무시 */
        }
      }
      return;
    }

    timer = setTimeout(tick, tickMs);
  };

  // 최초 렌더
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
