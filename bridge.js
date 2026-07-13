// 运行在 ISOLATED 世界：桥接「页面 MAIN 世界的 postMessage」→「插件 background」。
// MAIN 世界能改 window.WebSocket 但拿不到 chrome.runtime；ISOLATED 世界反之。故需要这层桥。
(function () {
  // 主框架开始加载 → 通知 background 清该 tab 旧缓存（代替 webNavigation 权限，见 background.js）
  if (window === window.top) {
    try {
      chrome.runtime.sendMessage({ type: 'WSMP_INIT' })?.catch?.(() => {});
    } catch (e) {
      /* 扩展上下文失效时忽略 */
    }
  }

  const buffer = [];
  let flushTimer = null;

  function flush() {
    flushTimer = null;
    if (!buffer.length) return;
    const batch = buffer.splice(0, buffer.length);
    try {
      // sendMessage 返回 promise，background 未就绪时 rejection 需静默吞掉，不影响页面
      chrome.runtime.sendMessage({ type: 'WSMP_FRAMES', frames: batch })?.catch?.(() => {});
    } catch (e) {
      // 扩展上下文失效（更新/移除）时静默丢弃
    }
  }

  window.addEventListener('message', function (ev) {
    // 只收本页面 MAIN 世界发来的、带 __wsmp 标记的消息
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__wsmp !== true || !d.frame) return;
    buffer.push(d.frame);
    // 高频推送做 200ms 批量转发，避免刷爆 runtime 消息通道
    if (!flushTimer) flushTimer = setTimeout(flush, 200);
    // 缓冲过大时立即 flush，防止积压
    if (buffer.length >= 200) {
      clearTimeout(flushTimer);
      flush();
    }
  });
})();
