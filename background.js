// Service Worker：按 tabId 缓存 WS 帧，供 popup 读取。
// MV3 SW 会休眠，故帧同时落地到 chrome.storage.session（会话级、随浏览器关闭清除），保证休眠后不丢。

const MAX_FRAMES_PER_TAB = 4000; // 每 tab 环形缓冲上限，防止长跑内存/存储膨胀
const mem = new Map(); // tabId -> frames[]（内存快取，SW 活着时用）

function keyOf(tabId) {
  return 'wsmp_' + tabId;
}

async function loadTab(tabId) {
  if (mem.has(tabId)) return mem.get(tabId);
  const k = keyOf(tabId);
  const got = await chrome.storage.session.get(k);
  const arr = got[k] || [];
  mem.set(tabId, arr);
  return arr;
}

async function saveTab(tabId, arr) {
  mem.set(tabId, arr);
  await chrome.storage.session.set({ [keyOf(tabId)]: arr });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 主框架开始加载新页面（bridge.js 在 document_start 发来）→ 清该 tab 旧缓存，避免串数据。
  // 用这个代替 webNavigation.onBeforeNavigate：少申请一个敏感权限，商店审核友好；
  // 时机也够早——content script 的 document_start 先于页面任何 WS 建连。
  if (msg && msg.type === 'WSMP_INIT' && sender.tab) {
    const tabId = sender.tab.id;
    mem.delete(tabId);
    chrome.storage.session.remove(keyOf(tabId));
    return;
  }

  // 来自 bridge.js（content script）的批量帧
  if (msg && msg.type === 'WSMP_FRAMES' && sender.tab) {
    const tabId = sender.tab.id;
    (async () => {
      let arr = await loadTab(tabId);
      arr = arr.concat(msg.frames);
      if (arr.length > MAX_FRAMES_PER_TAB) arr = arr.slice(arr.length - MAX_FRAMES_PER_TAB);
      await saveTab(tabId, arr);
    })();
    return; // 不需要回复
  }

  // 来自 popup 的查询/清空
  if (msg && msg.type === 'WSMP_GET') {
    (async () => {
      const arr = await loadTab(msg.tabId);
      sendResponse({ frames: arr });
    })();
    return true; // 异步回复
  }
  if (msg && msg.type === 'WSMP_CLEAR') {
    (async () => {
      await saveTab(msg.tabId, []);
      sendResponse({ ok: true });
    })();
    return true;
  }
});

// tab 关闭时清掉旧缓存（onRemoved 监听不需要 "tabs" 权限）
// 刷新/导航的清理由上面的 WSMP_INIT 消息负责
chrome.tabs.onRemoved.addListener((tabId) => {
  mem.delete(tabId);
  chrome.storage.session.remove(keyOf(tabId));
});
