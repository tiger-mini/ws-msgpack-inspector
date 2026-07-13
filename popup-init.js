// popup 入口：拿当前激活 tab，启动共享 App。
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  new WSMPApp({ tabId: tab && tab.id, isFullscreen: false }).init();
})();
