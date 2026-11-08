/** 官方桌面启动时 Fiber._reload 还在挂 desktop-office，settle 不得解包/杀进程。 */

export const DESKTOP_SETTLE_DELAY_MS = 4000;

export function isInactiveContextError(error) {
  if (!error) return false;
  if (error.code === "INACTIVE_EFFECT") return true;
  return /inactive context/i.test(String(error.message || error));
}

export function watchContextLife(ctx) {
  const life = { alive: true };
  if (!ctx || typeof ctx.effect !== "function") return life;
  try {
    ctx.effect(() => () => {
      life.alive = false;
    });
  } catch (error) {
    if (isInactiveContextError(error)) {
      life.alive = false;
      return life;
    }
    throw error;
  }
  return life;
}

export function settleDelayMs(surface) {
  return surface === "desktop" ? DESKTOP_SETTLE_DELAY_MS : 0;
}

/** 桌面启动自愈不得 requestRestart / taskkill，否则 Cordis 会 INACTIVE_EFFECT。 */
export function settleMayRestart({ surface, sealed = false } = {}) {
  if (surface === "desktop") return false;
  if (sealed) return false;
  return true;
}

/** 密封 asar 上就地 extract/swap 会和官方 Host 的 Fiber._reload 抢锁。 */
export function settleMayReapply({ surface, sealed = false } = {}) {
  if (surface === "desktop" && sealed) return false;
  return true;
}

/**
 * 点「应用」后是否重启。
 *
 * 只在「这一次真的写了东西」时重启：
 *   - 密封桌面：必须完全退出才能换 asar，跟补丁状态无关
 *   - promptReady：提示词已写入、但代码补丁没对上（老路径，保持原行为）
 *   - appliedCount > 0：这次有新补丁落盘
 *
 * 已经全部应用过（applied=0、只剩 already）时不再重启——
 * 否则每次点「应用」都会弹一次重启框。
 */
export function applyShouldRestart({
  complete = false,
  sealed = false,
  appliedCount = 0,
  promptReady = false,
} = {}) {
  if (sealed) return true;
  if (promptReady) return true;
  return Number(appliedCount) > 0;
}
