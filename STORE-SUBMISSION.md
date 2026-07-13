# 商店提交材料 / Store Submission Notes

提交 Edge（Partner Center）或 Chrome（开发者后台）时用：
**英文部分整段复制**进 "Notes for certification"（Edge）/ "审核备注"（Chrome）栏；中文对照仅供自己核对，不用提交。
隐私政策 URL（已发布）：https://github.com/tiger-mini/ws-msgpack-inspector/blob/main/PRIVACY.md

---

## Notes for certification（复制这段提交）

```
WS MessagePack Inspector is a developer debugging tool that captures and
displays WebSocket frames of the current tab. It decodes SignalR +
MessagePack binary frames into readable JSON, entirely locally.

=== TEST STEPS (any public website using WebSocket works) ===

1. Install the extension FIRST.
2. Open https://websocketking.com/ (an online WebSocket testing tool) in a
   NEW tab. Important: the page must load AFTER the extension is installed,
   because the extension hooks the WebSocket constructor at document_start,
   before the page creates any connection. If the page was already open,
   just reload it.
3. On that page, connect to the public echo server: wss://echo.websocket.org
   and send any text message a few times (the server echoes them back).
4. Click the extension icon in the toolbar. In the popup, switch to the
   third tab "原始帧" (= "Raw frames").
5. You will see the full connection lifecycle in real time: "open", "send",
   "recv" and "close" entries, each with a millisecond timestamp and the
   frame payload. The connection filter dropdown and the search box filter
   the list; each entry has a copy button.
6. This works on ANY site with live WebSocket traffic (e.g. a cryptocurrency
   exchange page with live tickers), not only the test tool above.

=== ABOUT THE OTHER TWO TABS (full functionality) ===

The tabs "点位最新值" (= "Latest point values") and "订阅点位"
(= "Subscriptions") additionally decode SignalR + MessagePack BINARY frames,
as used by industrial SCADA / monitoring dashboards. Such systems run on
private factory networks and cannot be exposed to the public internet, so
these two tabs stay empty on a plain-text WebSocket site — this is by
design, not a defect. The store listing screenshots are captured from a
real monitoring system and show these two views fully populated. The
"Raw frames" tab tested above is sufficient to verify the extension's
core capture-and-display functionality.

=== PERMISSIONS & PRIVACY ===

- The ONLY permission requested is "storage": captured frames are kept in
  chrome.storage.session as a per-tab cache (capped at 4000 frames), and
  are automatically cleared when the tab is closed, the page reloads, or
  the browser exits.
- Content scripts match <all_urls> because (a) a debugging tool cannot know
  the target site in advance, and (b) the WebSocket constructor must be
  replaced BEFORE page scripts run (document_start / MAIN world), otherwise
  early connections would be missed. This is the same pattern used by
  developer tools such as React Developer Tools.
- The extension collects and transmits NOTHING. No server, no analytics,
  no tracking, no external network request of any kind. All decoding
  happens locally inside the popup. Privacy policy:
  https://github.com/tiger-mini/ws-msgpack-inspector/blob/main/PRIVACY.md
  Source code is open at: https://github.com/tiger-mini/ws-msgpack-inspector

=== UI LANGUAGE ===

The UI is Simplified Chinese (target audience: Chinese-speaking
developers). Key labels for reference:
  点位最新值 = Latest point values   订阅点位 = Subscriptions
  原始帧 = Raw frames               全部连接 = All connections
  刷新 = Refresh                    清空 = Clear
  倒序 / 正序 = Sort desc / asc     复制 = Copy
```

---

## 中文对照（自己核对用，不提交）

**工具定位**：捕获并展示当前标签页的 WebSocket 帧，把 SignalR + MessagePack 二进制帧解码成可读 JSON，全程本地。

**测试步骤**（任何有 WS 的公网站点都能测）：

1. **先装扩展**
2. **新开标签页**打开 https://websocketking.com/ （在线 WS 测试工具）。关键：页面必须在装完扩展**之后**加载——hook 发生在 document_start、建连之前；已开着的页面刷新即可
3. 连公共回声服务器 `wss://echo.websocket.org`，随便发几条消息（服务器会原样回显）
4. 点工具栏扩展图标，切到第三个页签「原始帧」
5. 能实时看到完整连接生命周期：open / send / recv / close，每条带毫秒时间戳和帧内容；连接下拉框和搜索框可过滤，每条有复制按钮
6. 任何有实时 WS 流量的站点（如交易所行情页）同样有效，不限于上面的测试工具

**另外两个页签的说明**（补充点一）：「点位最新值」「订阅点位」解码的是工业 SCADA/监控系统的 SignalR + MessagePack 二进制帧，这类系统跑在工厂内网、无法公网暴露，所以在纯文本 WS 站点上这两个页签为空——**是设计如此，不是缺陷**。商店 listing 截图取自真实监控系统，展示了这两个视图有数据的完整效果；上述「原始帧」测试已足够验证扩展的核心捕获展示功能。

**权限与隐私**（补充点二）：唯一权限 `storage`（会话级、每 tab 上限 4000 帧、关标签/刷新/关浏览器自动清）；`<all_urls>` 注入是因为调试目标无法预知 + 必须在页面脚本前替换 WebSocket 构造器（React DevTools 同款模式）；零收集零上传，无服务器无埋点无任何外部请求，解码全在 popup 本地完成。

**UI 语言说明**：界面为简体中文（目标用户是中文开发者），备注里附了关键按钮的中英对照，免得审核员看不懂界面。

---

## Edge Partner Center「Privacy」页填写

> 注意：此表单内容会公开显示在商店详情页，故用英文填。

**Single purpose description**（复制粘贴）：

```
WS MessagePack Inspector is a developer debugging tool with a single
purpose: capture the WebSocket frames of the current tab and display them
locally in the extension popup, decoding SignalR + MessagePack binary
frames into readable JSON (subscribed data points and pushed values), so
that developers can debug binary WebSocket traffic that the browser's
Network panel cannot display in readable form. It has no other function.
```

**Permission justification → storage justification**（复制粘贴）：

```
The "storage" permission is used solely to keep captured WebSocket frames
in chrome.storage.session as a per-tab cache (capped at 4000 frames per
tab), so that the MV3 service worker can be suspended and revived without
losing frames before the popup reads them. The data never leaves the
browser: session storage is automatically cleared when the tab is closed,
the page is reloaded, or the browser exits. No sync storage, no persistent
storage, no transmission to any server.
```

**Are you using remote code?** → 选 **No, I am not using remote code**，Justification 填：

```
All JavaScript is included in the extension package. No external <script>
references, no remotely hosted modules, no eval() of remote strings.
```

**Data usage** 勾选（诚实披露，本地处理也算"访问该类数据"）：

- ☑ **User activity** —— 示例里明确写了 "network monitoring"，捕获 WS 帧就是这个
- ☑ **Website content** —— 帧载荷属于网站内容
- 其余八项（PII / 健康 / 财务 / 认证 / 通信 / 位置 / Web history 等）**全不勾**——扩展设计目的不涉及

**Privacy policy URL**：填 PRIVACY.md 的公网地址（勾了数据项后此栏必填）

**I certify that the following disclosures are true** → **三项全勾**（不卖数据、不用于单一用途之外、不用于信贷——全部属实）

---

## 提交前自查

- [x] 隐私政策已发布：https://github.com/tiger-mini/ws-msgpack-inspector/blob/main/PRIVACY.md
- [ ] 用备注里的步骤自己真机走一遍（装扩展 → websocketking → echo 服务器 → 原始帧有数据）
- [ ] listing 截图用 `snapshoot/store/`（1280×800）
- [ ] 商店描述 ≥250 字符（Edge 硬性要求，manifest 里那句不够长）
