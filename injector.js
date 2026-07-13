// 运行在页面 MAIN 世界 + document_start：抢在页面 JS 之前把原生 WebSocket 换成代理，
// 这样才能 hook 到「页面加载早期就建立」的连接（Network 面板抓不到这种历史帧）。
(function () {
  if (window.__WS_MP_HOOKED__) return;
  window.__WS_MP_HOOKED__ = true;
  window.__WS_MP_VERSION__ = 'cid-2'; // 版本标记。控制台查 window.__WS_MP_VERSION__ 确认注入的是否为当前版本

  const OrigWS = window.WebSocket;

  // 二进制 → base64（体积小、postMessage 传输快；popup 侧再解回字节）
  function toB64(buf) {
    const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer || buf);
    let s = '';
    const CHUNK = 0x8000; // 分块避免 apply 参数过多爆栈
    for (let i = 0; i < u8.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
    }
    return btoa(s);
  }

  function post(frame) {
    try {
      window.postMessage({ __wsmp: true, frame }, '*');
    } catch (e) {
      /* 忽略 postMessage 失败 */
    }
  }

  function describe(data) {
    try {
      if (typeof data === 'string') return { kind: 'string', text: data };
      if (data instanceof ArrayBuffer) return { kind: 'bin', b64: toB64(data), len: data.byteLength };
      if (data && data.buffer instanceof ArrayBuffer) return { kind: 'bin', b64: toB64(data), len: data.byteLength };
      if (data instanceof Blob) return { kind: 'blob' }; // signalR 默认 arraybuffer，一般不会走这
      return { kind: 'other', text: String(data) };
    } catch (e) {
      return { kind: 'err', text: String(e) };
    }
  }

  let connSeq = 0; // 连接自增 id，供按连接过滤

  function WSProxy(url, protocols) {
    const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
    // 确保二进制以 arraybuffer 到达（signalR 本就如此，双保险）
    try {
      ws.binaryType = 'arraybuffer';
    } catch (e) {
      /* 某些实现只读，忽略 */
    }

    const cid = ++connSeq;
    const urlStr = String(url);

    post({ t: Date.now(), dir: 'open', cid, url: urlStr });

    const origSend = ws.send.bind(ws);
    ws.send = function (d) {
      post({ t: Date.now(), dir: 'send', cid, url: urlStr, ...describe(d) });
      return origSend(d);
    };
    ws.addEventListener('message', function (ev) {
      post({ t: Date.now(), dir: 'recv', cid, url: urlStr, ...describe(ev.data) });
    });
    ws.addEventListener('close', function () {
      post({ t: Date.now(), dir: 'close', cid, url: urlStr });
    });
    return ws;
  }

  // 保留原型链与静态常量，否则 signalR 会因缺 WebSocket.OPEN 等而报错
  WSProxy.prototype = OrigWS.prototype;
  WSProxy.CONNECTING = OrigWS.CONNECTING;
  WSProxy.OPEN = OrigWS.OPEN;
  WSProxy.CLOSING = OrigWS.CLOSING;
  WSProxy.CLOSED = OrigWS.CLOSED;
  window.WebSocket = WSProxy;
  // 注意：不在页面控制台打 log——扩展会注入所有网站，别污染别人的 console（商店审核也在意这个）
})();
