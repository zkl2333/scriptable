import { createUpdater } from '../lib/updater.js';
import {
  attachMenuURL,
  presentWidgetPreviews,
  runWidgetMenu,
  shouldShowWidgetMenu,
} from '../lib/widget-menu.js';

const updater = createUpdater({
  scriptId: __SCRIPT_ID__,
  version: __SCRIPT_VERSION__,
  updateURL: __UPDATE_URL__,
});
await updater.autoUpdate();

// MD5 实现
const MD5 = function (string) {
  function RotateLeft(lValue, iShiftBits) {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
  }

  function AddUnsigned(lX, lY) {
    var lX4, lY4, lX8, lY8, lResult;

    lX8 = lX & 0x80000000;

    lY8 = lY & 0x80000000;

    lX4 = lX & 0x40000000;

    lY4 = lY & 0x40000000;

    lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);

    if (lX4 & lY4) {
      return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    }

    if (lX4 | lY4) {
      if (lResult & 0x40000000) {
        return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
      } else {
        return lResult ^ 0x40000000 ^ lX8 ^ lY8;
      }
    } else {
      return lResult ^ lX8 ^ lY8;
    }
  }

  function F(x, y, z) {
    return (x & y) | (~x & z);
  }

  function G(x, y, z) {
    return (x & z) | (y & ~z);
  }

  function H(x, y, z) {
    return x ^ y ^ z;
  }

  function I(x, y, z) {
    return y ^ (x | ~z);
  }

  function FF(a, b, c, d, x, s, ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));

    return AddUnsigned(RotateLeft(a, s), b);
  }

  function GG(a, b, c, d, x, s, ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));

    return AddUnsigned(RotateLeft(a, s), b);
  }

  function HH(a, b, c, d, x, s, ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));

    return AddUnsigned(RotateLeft(a, s), b);
  }

  function II(a, b, c, d, x, s, ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));

    return AddUnsigned(RotateLeft(a, s), b);
  }

  function ConvertToWordArray(string) {
    var lWordCount;

    var lMessageLength = string.length;

    var lNumberOfWords_temp1 = lMessageLength + 8;

    var lNumberOfWords_temp2 =
      (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;

    var lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;

    var lWordArray = Array(lNumberOfWords - 1);

    var lBytePosition = 0;

    var lByteCount = 0;

    while (lByteCount < lMessageLength) {
      lWordCount = (lByteCount - (lByteCount % 4)) / 4;

      lBytePosition = (lByteCount % 4) * 8;

      lWordArray[lWordCount] =
        lWordArray[lWordCount] |
        (string.charCodeAt(lByteCount) << lBytePosition);

      lByteCount++;
    }

    lWordCount = (lByteCount - (lByteCount % 4)) / 4;

    lBytePosition = (lByteCount % 4) * 8;

    lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);

    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;

    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;

    return lWordArray;
  }

  function WordToHex(lValue) {
    var WordToHexValue = "",
      WordToHexValue_temp = "",
      lByte,
      lCount;

    for (lCount = 0; lCount <= 3; lCount++) {
      lByte = (lValue >>> (lCount * 8)) & 255;

      WordToHexValue_temp = "0" + lByte.toString(16);

      WordToHexValue =
        WordToHexValue +
        WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
    }

    return WordToHexValue;
  }

  function Utf8Encode(string) {
    string = string.replace(/\r\n/g, "\n");

    var utftext = "";

    for (var n = 0; n < string.length; n++) {
      var c = string.charCodeAt(n);

      if (c < 128) {
        utftext += String.fromCharCode(c);
      } else if (c > 127 && c < 2048) {
        utftext += String.fromCharCode((c >> 6) | 192);

        utftext += String.fromCharCode((c & 63) | 128);
      } else {
        utftext += String.fromCharCode((c >> 12) | 224);

        utftext += String.fromCharCode(((c >> 6) & 63) | 128);

        utftext += String.fromCharCode((c & 63) | 128);
      }
    }

    return utftext;
  }

  var x = Array();

  var k, AA, BB, CC, DD, a, b, c, d;

  var S11 = 7,
    S12 = 12,
    S13 = 17,
    S14 = 22;

  var S21 = 5,
    S22 = 9,
    S23 = 14,
    S24 = 20;

  var S31 = 4,
    S32 = 11,
    S33 = 16,
    S34 = 23;

  var S41 = 6,
    S42 = 10,
    S43 = 15,
    S44 = 21;

  string = Utf8Encode(string);

  x = ConvertToWordArray(string);

  a = 0x67452301;
  b = 0xefcdab89;
  c = 0x98badcfe;
  d = 0x10325476;

  for (k = 0; k < x.length; k += 16) {
    AA = a;
    BB = b;
    CC = c;
    DD = d;

    a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478);

    d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756);

    c = FF(c, d, a, b, x[k + 2], S13, 0x242070db);

    b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);

    a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf);

    d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a);

    c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613);

    b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);

    a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8);

    d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af);

    c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1);

    b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);

    a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122);

    d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193);

    c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e);

    b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);

    a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562);

    d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340);

    c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51);

    b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);

    a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d);

    d = GG(d, a, b, c, x[k + 10], S22, 0x2441453);

    c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681);

    b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);

    a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6);

    d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6);

    c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87);

    b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);

    a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905);

    d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);

    c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9);

    b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);

    a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942);

    d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681);

    c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122);

    b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);

    a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44);

    d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);

    c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60);

    b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);

    a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6);

    d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa);

    c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085);

    b = HH(b, c, d, a, x[k + 6], S34, 0x4881d05);

    a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039);

    d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5);

    c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8);

    b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665);

    a = II(a, b, c, d, x[k + 0], S41, 0xf4292244);

    d = II(d, a, b, c, x[k + 7], S42, 0x432aff97);

    c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7);

    b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);

    a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3);

    d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);

    c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d);

    b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);

    a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f);

    d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);

    c = II(c, d, a, b, x[k + 6], S43, 0xa3014314);

    b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);

    a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82);

    d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235);

    c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb);

    b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);

    a = AddUnsigned(a, AA);

    b = AddUnsigned(b, BB);

    c = AddUnsigned(c, CC);

    d = AddUnsigned(d, DD);
  }

  var temp = WordToHex(a) + WordToHex(b) + WordToHex(c) + WordToHex(d);

  return temp.toLowerCase();
};

// Base64 实现
function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

class iKuai {
  constructor(host, port, https) {
    this.host = host;
    this.port = port;
    this.protocol = https ? "https" : "http";
  }

  async login(username, password) {
    let passwd = MD5(password);
    let pass = toBase64("salt_11" + password);
    let login_info = {
      passwd: passwd,
      pass: pass,
      remember_password: "",
      username: username,
    };
    let url = `${this.protocol}://${this.host}:${this.port}/Action/login`;

    try {
      let request = new Request(url);
      request.method = "POST";
      request.headers = { "Content-Type": "application/json" };
      request.body = JSON.stringify(login_info);

      let response = await request.loadJSON();
      if (response && response.Result == 10000) {
        const sessionCookie = request.response.cookies.find(
          (cookie) => cookie.name === 'sess_key'
        );
        if (!sessionCookie) throw new Error('登录响应未提供 sess_key Cookie');
        this.accessKey = sessionCookie.value;
        this.username = username;
        return this.accessKey;
      } else {
        throw new Error(response);
      }
    } catch (error) {
      throw error;
    }
  }

  async exec(func, action, param, accessKey) {
    const sessionKey = String(this.accessKey || accessKey || '').replace(/^sess_key=/, '');
    if (!sessionKey) {
      throw new Error("ERR_NOT_LOGGED_IN");
    }

    let url = `${this.protocol}://${this.host}:${this.port}/Action/call`;

    try {
      let request = new Request(url);
      request.method = "POST";
      request.headers = {
        "Content-Type": "application/json;charset=UTF-8",
        Cookie: `username=${this.username || ''}; login=1; sess_key=${sessionKey}`,
      };
      request.body = JSON.stringify({
        func_name: func,
        action: action,
        param: param,
      });

      let response = await request.loadString();
      try {
        return JSON.parse(response);
      } catch (e) {
        console.log(e);
        throw e;
      }
    } catch (error) {
      throw error;
    }
  }
}

const createInfo = (str) => {
  const [username, password, host, port] = str.split(/[@:]/);
  return { host, port, username, password };
};

// 格式化字节
const formatBytes = (bytes, decimals = 2) => {
  const value = Math.max(0, Number(bytes) || 0);
  if (value === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.min(Math.floor(Math.log(value) / Math.log(k)), sizes.length - 1);

  return `${parseFloat((value / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// 百分比字符串平均数
const avg = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return '0.00';
  const num = arr.map((item) => parseInt(item.replace("%", "")));
  const sum = num.reduce((acc, cur) => acc + cur, 0);
  return (sum / arr.length).toFixed(2);
};

// 格式化在线时长（秒 → 紧凑中文）
const formatTime = (time) => {
  const totalSeconds = Math.max(0, Math.floor(Number(time) || 0));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分`;
};

const getRouterError = (response) => {
  const code = response?.code ?? response?.Result ?? response?.result ?? '未知响应';
  const message = response?.ErrMsg || response?.Message || response?.message;
  return message ? `接口错误 ${code}: ${message}` : `接口错误 ${code}: 未返回系统状态`;
};

const getRouterData = (response) => {
  if (response?.code === 0) return response.results;
  if (response?.Result === 30000) return response.Data;
  return null;
};
const getKeyChain = (key) => {
  if (Keychain.contains(key)) {
    return Keychain.get(key);
  }
  return null;
};

const loadStoredInfo = () => ({
  username: getKeyChain('ikuai_username') || '',
  password: getKeyChain('ikuai_password') || '',
  host: getKeyChain('ikuai_host') || '',
  port: getKeyChain('ikuai_port') || '',
});

const saveInfo = (info) => {
  Keychain.set('ikuai_username', info.username);
  Keychain.set('ikuai_password', info.password);
  Keychain.set('ikuai_host', info.host);
  Keychain.set('ikuai_port', info.port);
};

const configureRouter = async () => {
  const current = loadStoredInfo();
  const alert = new Alert();
  alert.title = '设置爱快路由器信息';
  alert.addTextField('username', current.username);
  if (typeof alert.addSecureTextField === 'function') {
    alert.addSecureTextField('password', current.password);
  } else {
    alert.addTextField('password', current.password);
  }
  alert.addTextField('host', current.host);
  alert.addTextField('port', current.port);
  alert.addAction('保存');
  alert.addCancelAction('取消');
  if ((await alert.presentAlert()) !== 0) return null;

  const info = {
    username: alert.textFieldValue(0).trim(),
    password: alert.textFieldValue(1),
    host: alert.textFieldValue(2).trim(),
    port: alert.textFieldValue(3).trim(),
  };
  saveInfo(info);
  return info;
};

const getWidgetInfo = () => {
  const parameter = String(args.widgetParameter || '').trim();
  const info = parameter ? createInfo(parameter) : loadStoredInfo();
  if (!info.username || !info.password || !info.host || !info.port) {
    throw new Error('请先在 Scriptable App 内运行脚本，完成爱快路由器配置');
  }
  saveInfo(info);
  return info;
};

// 绘制环形进度条
function drawCircularProgress({
  center,
  radius,
  lineWidth,
  progress,
  backgroundColor,
  progressColor,
  textLarge,
  textSmall,
  textColor,
  fontLarge = 36,
  fontSmall = 22,
}) {
  let ctx = new DrawContext();
  ctx.size = new Size(200, 200); // 设置画布大小
  ctx.opaque = false; // 设置背景透明
  ctx.respectScreenScale = true; // 适应屏幕分辨率

  // 绘制背景圆环
  ctx.setStrokeColor(backgroundColor);
  ctx.setLineWidth(lineWidth);
  ctx.strokeEllipse(
    new Rect(center.x - radius, center.y - radius, 2 * radius, 2 * radius)
  );

  // 绘制进度部分
  const deg = Math.floor(360 * Math.min(Math.max(Number(progress) || 0, 0), 1)); // 将进度转换为角度
  const canvWidth = lineWidth; // 使用进度条的宽度作为小圆的直径

  for (let t = 0; t < deg; t++) {
    const rect_x =
      center.x + radius * Math.sin((t * Math.PI) / 180) - canvWidth / 2;
    const rect_y =
      center.y - radius * Math.cos((t * Math.PI) / 180) - canvWidth / 2;
    const rect_r = new Rect(rect_x, rect_y, canvWidth, canvWidth);
    ctx.setFillColor(progressColor);
    ctx.fillEllipse(rect_r);
  }

  // 设置文本格式
  ctx.setTextAlignedCenter();

  // 绘制大文字
  ctx.setFont(Font.boldSystemFont(fontLarge)); // 设置大文字的字体和大小
  ctx.setTextColor(textColor); // 设置大文字的颜色
  ctx.drawTextInRect(
    textLarge,
    new Rect(center.x - 100, center.y - fontLarge, 200, fontLarge + 4)
  ); // 在中间绘制大文字

  // 绘制小文字
  ctx.setFont(Font.systemFont(fontSmall)); // 设置小文字的字体和大小
  ctx.setTextColor(textColor); // 设置小文字的颜色
  ctx.drawTextInRect(
    textSmall,
    new Rect(center.x - 100, center.y + fontSmall * 0.7, 200, fontSmall + 8)
  ); // 在中间绘制小文字

  return ctx.getImage();
}

// ---------- 视觉常量 ----------
const COLORS = {
  bgTop: "#1B212B",
  bgBottom: "#12161D",
  text: "#F2F5F9",
  muted: "#8B96A8",
  down: "#4DA3FF",
  up: "#3ED598",
  cpu: "#FFB444",
  mem: "#FF6B5E",
  ringTrack: "#2C3442",
  divider: "#2A303C",
};

const LOGO_URL = "https://cdn.jsdelivr.net/gh/zkl2333/scriptable/image/ikuai64.ico";

// 拆分 "12.3 MB" 为数值与速率单位
const splitRate = (bytesPerSec) => {
  const text = formatBytes(Math.max(0, Number(bytesPerSec) || 0));
  const [value, unit] = text.split(" ");
  return { value, unit: unit === "Bytes" ? "B/s" : `${unit}/s` };
};

// 汇总接口数据为展示用指标
const collectMetrics = (sysstat) => {
  const stream = sysstat.stream || {};
  const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const rawUptime = stream.uptime ?? sysstat.uptime;
  let uptime = "—";
  if (rawUptime !== undefined && rawUptime !== null && rawUptime !== "") {
    uptime =
      typeof rawUptime === "number" ? formatTime(rawUptime) : String(rawUptime);
  }
  const rawCpuTemp =
    Array.isArray(sysstat.cputemp) && sysstat.cputemp.length > 0
      ? sysstat.cputemp[0]
      : null;
  const cpuTemp =
    rawCpuTemp == null
      ? '—'
      : /[°℃]/.test(String(rawCpuTemp))
        ? String(rawCpuTemp)
        : `${rawCpuTemp}°C`;

  return {
    cpu: Math.round(Number(avg(sysstat.cpu)) || 0),
    mem: parseInt(String(sysstat.memory?.used || '0%').replace('%', ''), 10) || 0,
    cpuTemp,
    onlineUsers:
      sysstat.online_user?.count == null
        ? null
        : toNumber(sysstat.online_user.count),
    rateUp: toNumber(stream.upload),
    rateDown: toNumber(stream.download),
    totalUp: toNumber(stream.total_up),
    totalDown: toNumber(stream.total_down),
    connections: stream.connect_num != null ? toNumber(stream.connect_num) : null,
    uptime,
  };
};

const collectWanMetrics = (response) => {
  const data = getRouterData(response);
  const snapshots = Array.isArray(data?.snapshoot_wan)
    ? data.snapshoot_wan
    : [];
  const wan =
    snapshots.find((item) => Number(item.default_route) === 1) ||
    snapshots.find((item) => [3, 4].includes(Number(item.internet))) ||
    snapshots[0];

  if (!wan) {
    return { wanIp: '—', wanInterface: '—', wanUptime: '—' };
  }

  const updatedAt = Number(wan.updatetime);
  const uptimeSeconds =
    updatedAt > 1_000_000_000
      ? Math.max(0, Math.floor(Date.now() / 1000 - updatedAt))
      : Math.max(0, updatedAt || 0);

  return {
    wanIp: String(wan.ip_addr || '—'),
    wanInterface: String(wan.interface || '—'),
    wanUptime: uptimeSeconds > 0 ? formatTime(uptimeSeconds) : '—',
  };
};

// 绘制迷你横向进度条
const drawBarImage = (progress, colorHex) => {
  const ctx = new DrawContext();
  ctx.size = new Size(120, 8);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const track = new Path();
  track.addRoundedRect(new Rect(0, 0, 120, 8), 4, 4);
  ctx.addPath(track);
  ctx.setFillColor(new Color(COLORS.ringTrack));
  ctx.fillPath();

  const width = Math.max(8, Math.round(120 * Math.min(1, Math.max(0, progress))));
  const fill = new Path();
  fill.addRoundedRect(new Rect(0, 0, width, 8), 4, 4);
  ctx.addPath(fill);
  ctx.setFillColor(new Color(colorHex));
  ctx.fillPath();

  return ctx.getImage();
};

// 细横分隔线（纵向容器内）
const addHDivider = (stack) => {
  const line = stack.addStack();
  line.size = new Size(0, 1);
  line.backgroundColor = new Color(COLORS.divider);
};

// 细竖分隔线（横向容器内）
const addVDivider = (stack) => {
  const line = stack.addStack();
  line.size = new Size(1, 0);
  line.backgroundColor = new Color(COLORS.divider);
};

// 箭头符号（SF Symbol，缺失时回退字符箭头）
const addArrowIcon = (row, symbolName, colorHex, size = new Size(9, 11)) => {
  const symbol = SFSymbol.named(symbolName);
  if (symbol) {
    const icon = row.addImage(symbol.image);
    icon.imageSize = size;
    icon.imageColor = new Color(colorHex);
  } else {
    const arrow = row.addText(symbolName === "arrow.up" ? "↑" : "↓");
    arrow.font = Font.systemFont(9);
    arrow.textColor = new Color(colorHex);
  }
};

// 顶部标题行：logo + 名称 + 在线状态
const buildHeader = (
  widget,
  logo,
  uptimeText,
  { compact = false, updatedAt = null } = {}
) => {
  const row = widget.addStack();
  row.centerAlignContent();

  const logoImg = row.addImage(logo);
  const logoSize = compact ? 13 : 16;
  logoImg.imageSize = new Size(logoSize, logoSize);

  row.addSpacer(5);
  const title = row.addText("爱快");
  title.font = Font.semiboldSystemFont(compact ? 12 : 13);
  title.textColor = new Color(COLORS.text);

  row.addSpacer();

  const dot = row.addText("●");
  dot.font = Font.systemFont(7);
  dot.textColor = new Color(COLORS.up);
  row.addSpacer(4);
  const statusText = updatedAt
    ? `在线 ${uptimeText}  ·  ${updatedAt}`
    : `在线 ${uptimeText}`;
  const uptime = row.addText(statusText);
  uptime.font = Font.mediumSystemFont(9);
  uptime.textColor = new Color(COLORS.muted);
  uptime.lineLimit = 1;
  uptime.minimumScaleFactor = 0.75;
};

// 实时速率单元格：箭头 + 标签 + 数值/单位
const addRateCell = (
  parent,
  label,
  symbolName,
  rateBytes,
  colorHex,
  { valueFont = 15, detail = null } = {}
) => {
  const cell = parent.addStack();
  cell.layoutVertically();

  const head = cell.addStack();
  head.centerAlignContent();
  addArrowIcon(head, symbolName, colorHex);
  head.addSpacer(4);
  const labelText = head.addText(label);
  labelText.font = Font.mediumSystemFont(9);
  labelText.textColor = new Color(COLORS.muted);

  cell.addSpacer(3);

  const { value, unit } = splitRate(rateBytes);
  const valueRow = cell.addStack();
  valueRow.bottomAlignContent();
  const valueText = valueRow.addText(value);
  valueText.font = Font.semiboldSystemFont(valueFont);
  valueText.textColor = new Color(COLORS.text);
  valueText.minimumScaleFactor = 0.65;
  valueRow.addSpacer(3);
  const unitText = valueRow.addText(unit);
  unitText.font = Font.systemFont(9);
  unitText.textColor = new Color(COLORS.muted);

  if (detail) {
    cell.addSpacer(4);
    const detailText = cell.addText(detail);
    detailText.font = Font.mediumSystemFont(8);
    detailText.textColor = new Color(COLORS.muted);
    detailText.lineLimit = 1;
    detailText.minimumScaleFactor = 0.7;
  }
};

// 百分比单元格（带迷你进度条）
const addGaugeCell = (parent, label, percent, colorHex, barWidth = 60) => {
  const cell = parent.addStack();
  cell.layoutVertically();

  const labelText = cell.addText(label);
  labelText.font = Font.mediumSystemFont(9);
  labelText.textColor = new Color(COLORS.muted);

  cell.addSpacer(3);

  const valueRow = cell.addStack();
  valueRow.bottomAlignContent();
  const valueText = valueRow.addText(String(percent));
  valueText.font = Font.semiboldSystemFont(15);
  valueText.textColor = new Color(COLORS.text);
  valueRow.addSpacer(2);
  const unitText = valueRow.addText("%");
  unitText.font = Font.systemFont(9);
  unitText.textColor = new Color(COLORS.muted);

  cell.addSpacer(6);

  const bar = cell.addImage(drawBarImage(percent / 100, colorHex));
  bar.imageSize = new Size(barWidth, 4);
};

// 中号组件使用的紧凑横向负载条
const addGaugeRow = (parent, label, percent, colorHex, barWidth = 78) => {
  const row = parent.addStack();
  row.centerAlignContent();

  const labelText = row.addText(label);
  labelText.font = Font.mediumSystemFont(9);
  labelText.textColor = new Color(COLORS.muted);
  row.addSpacer();

  const valueText = row.addText(`${percent}%`);
  valueText.font = Font.semiboldSystemFont(11);
  valueText.textColor = new Color(COLORS.text);

  parent.addSpacer(4);
  const bar = parent.addImage(drawBarImage(percent / 100, colorHex));
  bar.imageSize = new Size(barWidth, 4);
};

// 通用信息单元格：标签 + 数值
const addInfoCell = (parent, label, value) => {
  const cell = parent.addStack();
  cell.layoutVertically();

  const labelText = cell.addText(label);
  labelText.font = Font.mediumSystemFont(9);
  labelText.textColor = new Color(COLORS.muted);
  cell.addSpacer(3);
  const valueText = cell.addText(value);
  valueText.font = Font.semiboldSystemFont(12);
  valueText.textColor = new Color(COLORS.text);
  valueText.lineLimit = 1;
  valueText.minimumScaleFactor = 0.65;
};

// 累计流量行：↓ 累计下行 · ↑ 累计上行
const addTotalsLine = (parent, metrics) => {
  const row = parent.addStack();
  row.centerAlignContent();

  const label = row.addText("累计");
  label.font = Font.mediumSystemFont(9);
  label.textColor = new Color(COLORS.muted);

  row.addSpacer(6);
  addArrowIcon(row, "arrow.down", COLORS.down, new Size(8, 10));
  row.addSpacer(3);
  const down = row.addText(formatBytes(metrics.totalDown));
  down.font = Font.mediumSystemFont(9);
  down.textColor = new Color(COLORS.text);

  row.addSpacer(10);
  addArrowIcon(row, "arrow.up", COLORS.up, new Size(8, 10));
  row.addSpacer(3);
  const up = row.addText(formatBytes(metrics.totalUp));
  up.font = Font.mediumSystemFont(9);
  up.textColor = new Color(COLORS.text);
};

// 添加环形进度图
const addRing = (parent, image, size) => {
  const img = parent.addImage(image);
  img.imageSize = new Size(size, size);
};

// 小尺寸：标题 + 速率 + 资源 + 累计
const buildSmallLayout = (widget, metrics, logo) => {
  buildHeader(widget, logo, metrics.uptime, { compact: true });

  widget.addSpacer(12);

  const rates = widget.addStack();
  addRateCell(rates, "下行", "arrow.down", metrics.rateDown, COLORS.down);
  rates.addSpacer();
  addRateCell(rates, "上行", "arrow.up", metrics.rateUp, COLORS.up);

  widget.addSpacer(12);

  const gauges = widget.addStack();
  addGaugeCell(gauges, "CPU", metrics.cpu, COLORS.cpu);
  gauges.addSpacer();
  addGaugeCell(gauges, "内存", metrics.mem, COLORS.mem);

  widget.addSpacer(12);

  addTotalsLine(widget, metrics);
};

// 中尺寸：实时速率主视图 + 系统负载 + 累计与连接汇总
const buildMediumLayout = (widget, metrics, logo, updatedAt) => {
  buildHeader(widget, logo, metrics.uptime, { updatedAt });

  widget.addSpacer(10);

  const main = widget.addStack();
  main.centerAlignContent();

  const rates = main.addStack();
  rates.size = new Size(174, 0);
  addRateCell(rates, '实时下行', 'arrow.down', metrics.rateDown, COLORS.down, {
    valueFont: 19,
  });
  rates.addSpacer();
  addRateCell(rates, '实时上行', 'arrow.up', metrics.rateUp, COLORS.up, {
    valueFont: 19,
  });

  main.addSpacer(13);
  addVDivider(main);
  main.addSpacer(13);

  const gauges = main.addStack();
  gauges.layoutVertically();
  addGaugeRow(gauges, 'CPU', metrics.cpu, COLORS.cpu);
  gauges.addSpacer(8);
  addGaugeRow(gauges, '内存', metrics.mem, COLORS.mem);

  widget.addSpacer(9);
  addHDivider(widget);
  widget.addSpacer(7);

  const summary = widget.addStack();
  addInfoCell(summary, '累计下行', formatBytes(metrics.totalDown));
  summary.addSpacer();
  addInfoCell(summary, '累计上行', formatBytes(metrics.totalUp));
  summary.addSpacer();
  addInfoCell(
    summary,
    '在线终端',
    metrics.onlineUsers == null ? '—' : String(metrics.onlineUsers)
  );
  summary.addSpacer();
  addInfoCell(
    summary,
    '当前连接',
    metrics.connections == null ? '—' : String(metrics.connections)
  );
};

// 大尺寸：双速率主视图 + 系统圆环 + 四项运行摘要
const buildLargeLayout = (widget, metrics, logo, rings, updatedAt) => {
  buildHeader(widget, logo, metrics.uptime, { updatedAt });

  widget.addSpacer(16);

  const rates = widget.addStack();
  addRateCell(rates, '实时下行', 'arrow.down', metrics.rateDown, COLORS.down, {
    valueFont: 24,
    detail: `累计 ${formatBytes(metrics.totalDown)}`,
  });
  rates.addSpacer();
  addRateCell(rates, '实时上行', 'arrow.up', metrics.rateUp, COLORS.up, {
    valueFont: 24,
    detail: `累计 ${formatBytes(metrics.totalUp)}`,
  });

  widget.addSpacer(16);
  addHDivider(widget);
  widget.addSpacer(15);

  const main = widget.addStack();
  main.centerAlignContent();

  const gaugeStack = main.addStack();
  gaugeStack.centerAlignContent();
  addRing(gaugeStack, rings.cpu, rings.size);
  gaugeStack.addSpacer(14);
  addRing(gaugeStack, rings.mem, rings.size);

  main.addSpacer(20);
  addVDivider(main);
  main.addSpacer(20);

  const detail = main.addStack();
  detail.layoutVertically();
  addInfoCell(detail, 'WAN 地址', metrics.wanIp);
  detail.addSpacer(12);
  addInfoCell(
    detail,
    '在线终端',
    metrics.onlineUsers == null ? '—' : String(metrics.onlineUsers)
  );
  detail.addSpacer(12);
  addInfoCell(
    detail,
    '当前连接',
    metrics.connections == null ? '—' : String(metrics.connections)
  );

  widget.addSpacer(16);
  addHDivider(widget);
  widget.addSpacer(12);

  const strip = widget.addStack();
  addInfoCell(strip, 'WAN 在线', metrics.wanUptime);
  strip.addSpacer();
  addInfoCell(strip, 'CPU 温度', metrics.cpuTemp);
  strip.addSpacer();
  addInfoCell(strip, '实时合计', `${formatBytes(metrics.rateDown + metrics.rateUp)}/s`);
  strip.addSpacer();
  addInfoCell(strip, '更新时间', updatedAt);
};

async function createWidget(info, family = config.widgetFamily || 'medium') {
  const widget = new ListWidget();

  const gradient = new LinearGradient();
  gradient.colors = [new Color(COLORS.bgTop), new Color(COLORS.bgBottom)];
  gradient.locations = [0, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(0, 1);
  widget.backgroundGradient = gradient;

  if (family === "small") {
    widget.setPadding(13, 14, 11, 14);
  } else if (family === "large") {
    widget.setPadding(16, 18, 14, 18);
  } else {
    widget.setPadding(13, 16, 12, 16);
  }

  try {
    const myRouter = new iKuai(info.host, info.port, false);
    await myRouter.login(info.username, info.password);

    const [response, wanResponse] = await Promise.all([
      myRouter.exec('homepage', 'show', { TYPE: 'sysstat' }),
      myRouter
        .exec('lan', 'show', { TYPE: 'ether_info,snapshoot' })
        .catch((error) => {
          console.log(`WAN 状态获取失败: ${error.message || error}`);
          return null;
        }),
    ]);
    const stats = getRouterData(response)?.sysstat;
    if (!stats) {
      console.log(JSON.stringify(response));
      throw new Error(getRouterError(response));
    }
    const metrics = {
      ...collectMetrics(stats),
      ...collectWanMetrics(wanResponse),
    };
    const logo = await new Request(LOGO_URL).loadImage();

    // 环形进度图仅供大尺寸使用，中尺寸用负载条提高空间利用率
    let rings = null;
    if (family === 'large') {
      const ringSize = 90;
      const ringFonts = { fontLarge: 38, fontSmall: 24 };
      const drawRing = (percent, label, colorHex) =>
        drawCircularProgress({
          center: new Point(100, 100),
          radius: 82,
          lineWidth: 15,
          progress: percent / 100,
          backgroundColor: new Color(COLORS.ringTrack),
          progressColor: new Color(colorHex),
          textLarge: percent + "%",
          textSmall: label,
          textColor: new Color(COLORS.text),
          ...ringFonts,
        });
      rings = {
        size: ringSize,
        cpu: drawRing(metrics.cpu, "CPU", COLORS.cpu),
        mem: drawRing(metrics.mem, "内存", COLORS.mem),
      };
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const updatedAt = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    if (family === "small") {
      buildSmallLayout(widget, metrics, logo);
    } else if (family === "large") {
      buildLargeLayout(widget, metrics, logo, rings, updatedAt);
    } else {
      buildMediumLayout(widget, metrics, logo, updatedAt);
    }
  } catch (error) {
    const failure = widget.addText('获取数据失败');
    failure.font = Font.mediumSystemFont(12);
    failure.textColor = new Color(COLORS.mem);
    const message = widget.addText(error.message || '未知错误');
    message.font = Font.systemFont(10);
    message.textColor = new Color(COLORS.muted);
    message.minimumScaleFactor = 0.65;
    console.log(error);
  }

  return attachMenuURL(widget);
}

if (shouldShowWidgetMenu()) {
  for (;;) {
    const action = await runWidgetMenu({
      title: '爱快路由器',
      version: __SCRIPT_VERSION__,
      updater,
      actions: [
        {
          id: 'settings',
          icon: '⚙',
          title: '配置路由器',
          subtitle: '保存用户名、密码、地址和端口',
        },
      ],
    });
    if (!action) break;

    if (action.action === 'settings') {
      const info = await configureRouter();
      if (info) await presentWidgetPreviews((family) => createWidget(info, family), ['medium']);
      break;
    }

    if (action.action === 'preview') {
      let info = loadStoredInfo();
      if (!info.username || !info.password || !info.host || !info.port) {
        info = await configureRouter();
      }
      if (info) {
        await presentWidgetPreviews((family) => createWidget(info, family), action.families);
      }
      break;
    }
  }
} else {
  Script.setWidget(await createWidget(getWidgetInfo()));
}

Script.complete();
