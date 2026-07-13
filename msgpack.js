// 最小 MessagePack 解码器 + signalR 帧拆分 + 点值提取。
// signalR 帧格式：[varint长度前缀][msgpack body][varint长度前缀][msgpack body]...（多帧粘连）
// 暴露到 window.WSMP。

(function () {
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function makeDecoder(bytes) {
    let i = 0;
    const td = new TextDecoder('utf-8');
    const u8 = () => bytes[i++];
    const readN = (n) => {
      const s = i;
      i += n;
      return bytes.slice(s, s + n);
    };
    const u16 = () => {
      const v = (bytes[i] << 8) | bytes[i + 1];
      i += 2;
      return v;
    };
    const u32 = () => {
      const v = bytes[i] * 16777216 + ((bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]);
      i += 4;
      return v;
    };
    const str = (n) => td.decode(new Uint8Array(readN(n)));
    const ext = (n) => {
      readN(1);
      readN(n);
      return '__ext';
    }; // 跳过 type + data（如时间戳）

    function decode() {
      const b = u8();
      if (b <= 0x7f) return b;
      if (b >= 0xe0) return b - 256;
      if (b >= 0x80 && b <= 0x8f) {
        const n = b & 0xf;
        const o = {};
        for (let k = 0; k < n; k++) {
          const key = decode();
          o[key] = decode();
        }
        return o;
      }
      if (b >= 0x90 && b <= 0x9f) {
        const n = b & 0xf;
        const a = [];
        for (let k = 0; k < n; k++) a.push(decode());
        return a;
      }
      if (b >= 0xa0 && b <= 0xbf) return str(b & 0x1f);
      switch (b) {
        case 0xc0:
          return null;
        case 0xc2:
          return false;
        case 0xc3:
          return true;
        case 0xcc:
          return u8();
        case 0xcd:
          return u16();
        case 0xce:
          return u32();
        case 0xca: {
          const dv = new DataView(new Uint8Array(readN(4)).buffer);
          return dv.getFloat32(0);
        }
        case 0xcb: {
          const dv = new DataView(new Uint8Array(readN(8)).buffer);
          return dv.getFloat64(0);
        }
        case 0xd9: {
          const n = u8();
          return str(n);
        }
        case 0xda: {
          const n = u16();
          return str(n);
        }
        case 0xdb: {
          const n = u32();
          return str(n);
        }
        case 0xdc: {
          const n = u16();
          const a = [];
          for (let k = 0; k < n; k++) a.push(decode());
          return a;
        }
        case 0xdd: {
          const n = u32();
          const a = [];
          for (let k = 0; k < n; k++) a.push(decode());
          return a;
        }
        case 0xde: {
          const n = u16();
          const o = {};
          for (let k = 0; k < n; k++) {
            const key = decode();
            o[key] = decode();
          }
          return o;
        }
        case 0xdf: {
          const n = u32();
          const o = {};
          for (let k = 0; k < n; k++) {
            const key = decode();
            o[key] = decode();
          }
          return o;
        }
        case 0xc4: {
          const n = u8();
          readN(n);
          return '__bin';
        }
        case 0xc5: {
          const n = u16();
          readN(n);
          return '__bin';
        }
        case 0xc6: {
          const n = u32();
          readN(n);
          return '__bin';
        }
        case 0xd0: {
          const v = u8();
          return v > 127 ? v - 256 : v;
        }
        case 0xd1: {
          const v = u16();
          return v > 32767 ? v - 65536 : v;
        }
        case 0xd2:
          return u32() | 0;
        case 0xd3: {
          readN(8);
          return '__i64';
        }
        case 0xcf: {
          readN(8);
          return '__u64';
        }
        case 0xd4:
          return ext(1);
        case 0xd5:
          return ext(2);
        case 0xd6:
          return ext(4);
        case 0xd7:
          return ext(8); // signalR 常用它编码时间戳
        case 0xd8:
          return ext(16);
        case 0xc7: {
          const n = u8();
          return ext(n);
        }
        case 0xc8: {
          const n = u16();
          return ext(n);
        }
        case 0xc9: {
          const n = u32();
          return ext(n);
        }
        default:
          throw new Error('unsupported msgpack byte 0x' + b.toString(16) + ' at ' + (i - 1));
      }
    }
    function readVarint() {
      let r = 0,
        s = 0,
        b;
      do {
        b = bytes[i++];
        r |= (b & 0x7f) << s;
        s += 7;
      } while (b & 0x80);
      return r >>> 0;
    }

    return {
      all() {
        const res = [];
        while (i < bytes.length) {
          try {
            const len = readVarint();
            const end = i + len;
            res.push(decode());
            i = end;
          } catch (e) {
            res.push({ __decodeErr: String(e) });
            break;
          }
        }
        return res;
      }
    };
  }

  // 解一个 recv/send 帧（base64）→ signalR 消息数组
  function decodeFrameB64(b64) {
    return makeDecoder(b64ToBytes(b64)).all();
  }

  // 从解码结果里递归提取所有 [tagName, value] 点值对（本项目：["前缀#设备#点位", 值, ...]，值在索引1）
  function collectPairs(msgs, out) {
    const acc = out || {};
    (function walk(x) {
      if (Array.isArray(x)) {
        if (typeof x[0] === 'string' && x[0].includes('#') && x.length >= 2 && typeof x[1] !== 'object') {
          acc[x[0]] = x[1];
        }
        x.forEach(walk);
      } else if (x && typeof x === 'object') {
        Object.values(x).forEach(walk);
      }
    })(msgs);
    return acc;
  }

  // 从 send 消息里提取 signalR 调用：[type, headers, invocationId, target, args]
  // Watch/WatchExp 的 target 是方法名，args[0] 通常是订阅的点位名数组
  function extractInvocation(msgs) {
    const out = [];
    (function walk(x) {
      if (Array.isArray(x) && typeof x[3] === 'string' && Array.isArray(x[4])) {
        out.push({ target: x[3], invocationId: x[2], args: x[4] });
      }
      if (Array.isArray(x)) x.forEach(walk);
    })(msgs);
    return out;
  }

  window.WSMP = { b64ToBytes, makeDecoder, decodeFrameB64, collectPairs, extractInvocation };
})();
