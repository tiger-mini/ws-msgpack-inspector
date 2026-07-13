# Privacy Policy / 隐私政策

**WS MessagePack Inspector**

Last updated / 最后更新: 2026-07-13

## English

WS MessagePack Inspector is a developer debugging tool that decodes SignalR + MessagePack binary WebSocket frames for inspection.

- **What it accesses:** WebSocket frames (sent and received) of the pages you visit, captured locally in your browser for display in the extension popup.
- **Where data is stored:** Only in your browser's session storage (`chrome.storage.session`). All data is automatically deleted when the tab is closed, the page is reloaded, or the browser is closed.
- **What is collected or transmitted: nothing.** The extension has no server. It does not collect, transmit, sell, or share any data. No analytics, no tracking, no external network requests of any kind.
- **Permissions:** `storage` is used solely for the session-level frame cache described above. Content scripts run on all sites because WebSocket connections must be hooked before page scripts run, and the target site cannot be known in advance — this is inherent to a debugging tool.

If you have questions, please open an issue in the project repository.

## 中文

WS MessagePack Inspector 是一个开发者调试工具，用于解码查看 SignalR + MessagePack 二进制 WebSocket 帧。

- **访问的内容：** 你所访问页面的 WebSocket 收发帧，仅在你的浏览器本地捕获，用于扩展弹窗内展示。
- **数据存储位置：** 仅存于浏览器会话存储（`chrome.storage.session`）。关闭标签页、刷新页面或关闭浏览器时自动清除。
- **收集或上传的数据：无。** 本扩展没有服务器，不收集、不上传、不出售、不共享任何数据；无统计埋点、无跟踪、无任何外部网络请求。
- **权限说明：** `storage` 仅用于上述会话级帧缓存。内容脚本注入所有网站是因为必须在页面脚本运行前 hook WebSocket，且无法预知调试目标站点——这是调试工具的固有需求。

如有疑问，请在项目仓库提 issue。
