// 共享渲染逻辑：popup 和全屏 viewer 都用它。
// 依赖：msgpack.js(window.WSMP)、icons.js(window.WSMPIcons)。
// 用法：WSMPApp.init({ tabId, isFullscreen })

(function () {
  const I = window.WSMPIcons;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  }

  // YYYY-MM-DD HH:mm:ss.SSSS（毫秒补到 4 位）
  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n, w) => String(n).padStart(w || 2, '0');
    const ms = p(d.getMilliseconds(), 3); // Date 只有 3 位毫秒
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${ms}`;
  }

  async function copyText(text, btnEl) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // 兜底：clipboard 不可用时用 execCommand
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch (_) {
        /* 兜底复制失败，忽略 */
      }
      document.body.removeChild(ta);
    }
    if (btnEl) {
      const old = btnEl.innerHTML;
      btnEl.innerHTML = I.svg('check', 13, '#5fec89');
      setTimeout(() => {
        btnEl.innerHTML = old;
      }, 900);
    }
  }

  function WSMPApp(opts) {
    this.tabId = opts.tabId;
    this.isFullscreen = !!opts.isFullscreen;
    this.frames = [];
    this.view = 'values';
    this.keyword = '';
    this.desc = true; // 默认倒序
    this.connFilter = 'all'; // 连接过滤：'all' 或某个 cid
    this.timer = null;
  }

  // url 取短名，如 wss://.../taghub?name=... → taghub
  WSMPApp.prototype.shortName = function (url) {
    if (!url) return '(未知)';
    try {
      const noQuery = String(url).split('?')[0];
      const seg = noQuery.replace(/\/+$/, '').split('/').pop();
      return seg || noQuery;
    } catch (e) {
      return String(url);
    }
  };

  // 收集所有连接：{ cid, url, name, count }（按 open 帧 + 帧上的 cid 汇总）
  WSMPApp.prototype.computeConns = function () {
    const m = new Map();
    for (const f of this.frames) {
      if (f.cid === null || f.cid === undefined) continue;
      if (!m.has(f.cid)) m.set(f.cid, { cid: f.cid, url: f.url || '', name: this.shortName(f.url), count: 0 });
      const c = m.get(f.cid);
      if (f.url && !c.url) {
        c.url = f.url;
        c.name = this.shortName(f.url);
      }
      if (f.dir === 'send' || f.dir === 'recv') c.count++;
    }
    return Array.from(m.values()).sort((a, b) => a.cid - b.cid);
  };

  // 按当前连接过滤返回帧子集（this.connFilter）
  WSMPApp.prototype.filteredFrames = function () {
    if (this.connFilter === 'all') return this.frames;
    const cid = Number(this.connFilter);
    return this.frames.filter((f) => f.cid === cid);
  };

  WSMPApp.prototype.loadFrames = function () {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'WSMP_GET', tabId: this.tabId }, (resp) => {
        resolve((resp && resp.frames) || []);
      });
    });
  };

  WSMPApp.prototype.computeValues = function () {
    const map = {};
    for (const f of this.filteredFrames()) {
      if (f.dir === 'recv' && f.kind === 'bin' && f.b64) {
        try {
          WSMP.collectPairs(WSMP.decodeFrameB64(f.b64), map);
        } catch (e) {
          /* 单帧解码失败跳过 */
        }
      }
    }
    return map;
  };

  WSMPApp.prototype.computeSubs = function () {
    const out = [];
    for (const f of this.filteredFrames()) {
      if (f.dir === 'send' && f.kind === 'bin' && f.b64) {
        try {
          WSMP.extractInvocation(WSMP.decodeFrameB64(f.b64)).forEach((x) => out.push(x));
        } catch (e) {
          /* 单帧解码失败跳过 */
        }
      }
    }
    return out;
  };

  WSMPApp.prototype.renderStats = function () {
    const f = this.filteredFrames();
    const n = (d) => f.filter((x) => x.dir === d).length;
    const scope =
      this.connFilter === 'all'
        ? '全部连接'
        : this.shortName((this.computeConns().find((c) => c.cid === Number(this.connFilter)) || {}).url);
    this.$stats.innerHTML = `<span class="dim">${scope}</span>&emsp;帧 <b>${f.length}</b>&emsp;send <b>${n('send')}</b>&emsp;recv <b>${n('recv')}</b>`;
  };

  // 渲染连接过滤下拉
  WSMPApp.prototype.renderConns = function () {
    if (!this.$conn) return;
    const conns = this.computeConns();
    const cur = this.connFilter;
    // 有帧但识别不到任何连接 → 页面注入的是旧 injector(帧未带 cid)，提示刷新
    if (conns.length === 0 && this.frames.length > 0) {
      this.$conn.innerHTML = `<option value="all" selected>连接未识别 · 请刷新页面</option>`;
      return;
    }
    let html = `<option value="all"${cur === 'all' ? ' selected' : ''}>全部连接 (${conns.length})</option>`;
    html += conns
      .map(
        (c) =>
          `<option value="${c.cid}"${String(cur) === String(c.cid) ? ' selected' : ''}>${esc(c.name)} · ${c.count} 帧</option>`
      )
      .join('');
    this.$conn.innerHTML = html;
  };

  WSMPApp.prototype.decodeFrameText = function (f) {
    if (f.kind === 'string') return f.text || '';
    if (f.kind === 'bin') {
      try {
        return JSON.stringify(WSMP.decodeFrameB64(f.b64));
      } catch (e) {
        return '[解码失败]';
      }
    }
    // open/close 等无 kind 的控制帧：显示 url 或帧类型，绝不返回 undefined(否则 body.length 抛错、整个视图空白)
    if (f.dir === 'open' || f.dir === 'close') return f.url ? `(${f.dir}) ${f.url}` : `(${f.dir})`;
    return f.text || f.kind || '';
  };

  WSMPApp.prototype.renderContentInner = function () {
    const el = this.$content;
    const kw = this.keyword.trim().toLowerCase();

    if (this.view === 'values') {
      const map = this.computeValues();
      let keys = Object.keys(map).sort();
      if (kw) keys = keys.filter((k) => k.toLowerCase().includes(kw));
      if (this.desc) keys.reverse();
      if (!keys.length) {
        el.innerHTML = `<div class="empty">无匹配点位</div>`;
        return;
      }
      el.innerHTML =
        `<div class="kv">` +
        keys
          .map((k) => {
            const cp = esc(k + ' = ' + map[k]);
            // k/v 也带 data-copy：双击行内任意格(含数值)都能复制，与右侧按钮内容一致
            return (
              `<div class="k" title="双击复制" data-copy="${cp}">${esc(k)}</div>` +
              `<div class="v" data-copy="${cp}">${esc(map[k])}</div>` +
              `<button class="mini copy-btn" data-copy="${cp}" title="复制">${I.svg('copy', 12)}</button>`
            );
          })
          .join('') +
        `</div>`;
      return;
    }

    if (this.view === 'subs') {
      let subs = this.computeSubs();
      if (kw)
        subs = subs.filter(
          (s) => (s.target || '').toLowerCase().includes(kw) || JSON.stringify(s.args).toLowerCase().includes(kw)
        );
      if (this.desc) subs.reverse();
      if (!subs.length) {
        el.innerHTML = `<div class="empty">无订阅记录（send 帧）</div>`;
        return;
      }
      el.innerHTML = subs
        .map((s) => {
          const tags = s.args && s.args[0] && Array.isArray(s.args[0]) ? s.args[0] : s.args;
          const list = Array.isArray(tags) ? tags : [tags];
          const shown = kw ? list.filter((x) => String(x).toLowerCase().includes(kw)) : list;
          const copyPayload = esc(JSON.stringify({ target: s.target, args: s.args }));
          return `<div class="sub-item">
          <div class="row-head">
            <span class="title">${esc(s.target)} <span class="dim">(${list.length} 点)</span></span>
            <button class="mini copy-btn" data-copy="${copyPayload}" title="复制此订阅">${I.svg('copy', 12)}</button>
          </div>
          <div class="tags">${shown.map(esc).join('，')}</div>
        </div>`;
        })
        .join('');
      return;
    }

    // raw
    let list = this.filteredFrames().slice();
    if (kw)
      list = list.filter(
        (f) => JSON.stringify(f).toLowerCase().includes(kw) || this.decodeFrameText(f).toLowerCase().includes(kw)
      );
    if (this.desc) list.reverse();
    const max = this.isFullscreen ? 1000 : 200;
    el.innerHTML =
      list
        .slice(0, max)
        .map((f) => {
          const body = this.decodeFrameText(f);
          const color = f.dir === 'send' ? '#5fec89' : f.dir === 'recv' ? '#ffc047' : '#77777f';
          // send=上传箭头 recv=下载箭头，其它(open/close)保留文字标签
          const dirTag =
            f.dir === 'send'
              ? I.svg('upload', 13, color)
              : f.dir === 'recv'
                ? I.svg('download', 13, color)
                : `<span style="color:${color}">[${f.dir}]</span>`;
          const clip = this.isFullscreen || body.length <= 2000 ? body : body.slice(0, 2000) + '…';
          const copyPayload = esc(body);
          return `<div class="raw-item">
        <div class="row-head">
          <span class="dir-tag" title="${f.dir}">${dirTag} <span class="ts">${fmtTime(f.t)}</span></span>
          <button class="mini copy-btn" data-copy="${copyPayload}" title="复制此帧">${I.svg('copy', 12)}</button>
        </div>
        <pre>${esc(clip)}</pre>
      </div>`;
        })
        .join('') || `<div class="empty">无帧</div>`;
  };

  // 渲染包装：保住滚动位置，避免每 1.5s 自动刷新重渲染时滚动条跳动、影响复制等操作。
  // - 贴底(正序)/贴顶(倒序)：跟随最新。
  // - 中间位置(用户在翻历史/正在复制)：保持可视内容不动。
  //   正序新帧追加在底部，恢复 scrollTop 即可；倒序新帧插在顶部，需用 scrollHeight 差值补偿，否则内容会往下飘。
  WSMPApp.prototype.renderContent = function () {
    const el = this.$content;
    if (!el) {
      this.renderContentInner();
      return;
    }

    const TOL = 30; // 贴边容差(px)
    const prevTop = el.scrollTop;
    const prevHeight = el.scrollHeight;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= TOL;
    const atTop = el.scrollTop <= TOL;

    this.renderContentInner();

    if (!this.desc) {
      // 正序：贴底则跟随最新，否则保持原位置(新帧在下方，上方内容位置不变)
      if (atBottom) el.scrollTop = el.scrollHeight;
      else el.scrollTop = prevTop;
    } else {
      // 倒序：贴顶则跟随最新(顶部)，否则用高度差补偿，保住当前可视内容
      if (atTop) el.scrollTop = 0;
      else el.scrollTop = prevTop + (el.scrollHeight - prevHeight);
    }
  };

  WSMPApp.prototype.refresh = async function () {
    this.frames = await this.loadFrames();
    // 选中的连接若已消失(如清空后)，回落到全部
    if (this.connFilter !== 'all' && !this.frames.some((f) => f.cid === Number(this.connFilter))) {
      this.connFilter = 'all';
    }
    this.renderConns();
    this.renderStats();
    this.renderContent();
  };

  WSMPApp.prototype.updateSortBtn = function () {
    if (!this.$sort) return;
    this.$sort.innerHTML = I.svg(this.desc ? 'sortDesc' : 'sortAsc', 14) + `<span>${this.desc ? '倒序' : '正序'}</span>`;
  };

  WSMPApp.prototype.init = function () {
    this.$stats = document.getElementById('stats');
    this.$content = document.getElementById('content');
    this.$sort = document.getElementById('sort');
    this.$conn = document.getElementById('conn');
    const self = this;

    // 连接过滤下拉
    if (this.$conn)
      this.$conn.addEventListener('change', (e) => {
        self.connFilter = e.target.value;
        self.renderStats();
        self.renderContent();
      });

    // 图标注入到按钮
    const setIcon = (id, name, label) => {
      const b = document.getElementById(id);
      if (b) b.innerHTML = I.svg(name, 14) + (label ? `<span>${label}</span>` : '');
    };
    setIcon('refresh', 'reload', '刷新');
    setIcon('clear', 'delete', '清空');
    if (document.getElementById('fullscreen')) setIcon('fullscreen', 'fullscreen', '全屏');
    this.updateSortBtn();

    // 视图切换
    document.querySelectorAll('nav button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('nav button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        self.view = btn.dataset.view;
        self.renderContent();
      });
    });

    document.getElementById('search').addEventListener('input', (e) => {
      self.keyword = e.target.value;
      self.renderContent();
    });
    document.getElementById('refresh').addEventListener('click', () => self.refresh());
    document.getElementById('clear').addEventListener('click', async () => {
      await new Promise((r) => {
        chrome.runtime.sendMessage({ type: 'WSMP_CLEAR', tabId: self.tabId }, r);
      });
      self.refresh();
    });
    if (this.$sort)
      this.$sort.addEventListener('click', () => {
        self.desc = !self.desc;
        self.updateSortBtn();
        self.renderContentInner();
        // 切排序是主动操作：直接定位到"最新那端"(正序=底、倒序=顶)，之后由 renderContent 跟随/保位接管
        if (self.$content) self.$content.scrollTop = self.desc ? 0 : self.$content.scrollHeight;
      });

    const fsBtn = document.getElementById('fullscreen');
    if (fsBtn)
      fsBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') + '?tabId=' + self.tabId });
      });

    // 事件委托：复制按钮点击
    this.$content.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.copy-btn');
      if (btn) copyText(btn.getAttribute('data-copy'), btn);
    });

    // 事件委托：双击数据行 = 触发本行右上角的复制图标(复用其 ✓ 反馈)。
    this.$content.addEventListener('dblclick', (e) => {
      if (!e.target.closest) return;
      // 找本行的 copy-btn：subs/raw 有行容器；values 是 grid，从双击格往后邻找 copy-btn
      const row = e.target.closest('.sub-item, .raw-item');
      let btn = row && row.querySelector('.copy-btn');
      if (!btn) {
        let n = e.target.closest('.k, .v, .copy-btn');
        while (n && !(n.classList && n.classList.contains('copy-btn'))) n = n.nextElementSibling;
        btn = n;
      }
      if (!btn) return;
      // 清掉双击选中的文本，避免残留高亮
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
      copyText(btn.getAttribute('data-copy'), btn); // btn 做反馈：图标变 ✓
    });

    this.refresh();
    this.timer = setInterval(() => self.refresh(), 1500);
  };

  window.WSMPApp = WSMPApp;
  window.WSMPUtil = { fmtTime, esc, copyText };
})();
