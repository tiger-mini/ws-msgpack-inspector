// 全屏 viewer 入口：tabId 从 URL query 拿。
(function () {
  const tabId = Number(new URLSearchParams(location.search).get('tabId'));
  const info = document.getElementById('tabinfo');
  if (info) info.textContent = 'tab #' + tabId;
  new WSMPApp({ tabId, isFullscreen: true }).init();
})();
