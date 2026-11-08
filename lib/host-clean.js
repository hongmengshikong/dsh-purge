/** 判定「宿主提示词已清洗」用的标记。desktop.js 生成 WSH 脚本时复用同一份。 */
export const HOST_CLEAN_MARKERS = {
  identity: "[dsh-purge] identity stripped",
  inject: [
    "[dsh-purge] complete prompt keeps waterfall inject",
    "[dsh-purge] complete prompt keeps inject",
    "[dsh-purge] fold-complete inject first",
  ],
  // 只用于「没有 identity 标记」的旧部署兜底。
  // 0.2.2 的合法代码里有 `… transformed.sections : [completeSection]` 的三元尾巴，
  // 用裸子串会把正常代码误判成「inject 被丢掉」，所以这里只认整行赋值形态。
  drops: [
    "sections: [completeSection]",
    "sections : [completeSection]",
  ],
};

/** 重启前看系统提示词文件：标记写上了，或者当前原文里已经没有那两处旧拦截。 */
export function hostPromptKeepsInject(text) {
  const body = String(text || "");
  // identity 标记由 #4/#25 写入；它们与提示词补丁同批落盘，出现即说明清洗跑过。
  // #40 归档后不再写 inject 标记，不能再用 injectMarked 当必要条件。
  if (body.includes(HOST_CLEAN_MARKERS.identity)) return true;
  // 空文件或不是这份模块，不能当成已经洗过。
  if (!body.includes("system-prompt/assemble")) return false;
  const identityLeft = body.includes("You are an AI agent powered by DeepSeek Harness.");
  // 三元表达式里的 `… : [completeSection]` 不是「被丢弃」的证据。
  const ternaryShape = body.includes("completeSection ===");
  const dropsInject = !ternaryShape && HOST_CLEAN_MARKERS.drops.some((m) => body.includes(m));
  return !identityLeft && !dropsInject;
}
