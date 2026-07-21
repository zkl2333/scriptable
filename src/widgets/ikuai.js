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

// 格式化时间
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
  ctx.setFont(Font.boldSystemFont(36)); // 设置大文字的字体和大小
  ctx.setTextColor(textColor); // 设置大文字的颜色
  ctx.drawTextInRect(
    textLarge,
    new Rect(center.x - 100, center.y - 36, 200, 40)
  ); // 在中间绘制大文字

  // 绘制小文字
  ctx.setFont(Font.systemFont(22)); // 设置小文字的字体和大小
  ctx.setTextColor(textColor); // 设置小文字的颜色
  ctx.drawTextInRect(
    textSmall,
    new Rect(center.x - 100, center.y + 15, 200, 30)
  ); // 在中间绘制小文字

  return ctx.getImage();
}

async function createWidget(info, family = config.widgetFamily || 'medium') {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#333333");
  widget.useDefaultPadding();

  try {
    const myRouter = new iKuai(info.host, info.port, false);
    await myRouter.login(info.username, info.password);

    const sysstat = await myRouter.exec("homepage", "show", {
      TYPE: "sysstat",
    });

    const stats = getRouterData(sysstat)?.sysstat;
    if (!stats) {
      console.log(JSON.stringify(sysstat));
      throw new Error(getRouterError(sysstat));
    }
    const stream = stats.stream || {};
    const cpu = avg(stats.cpu);
    const memory = parseInt(String(stats.memory?.used || '0%').replace("%", "")) || 0;

    if (family === 'small') {
      const title = widget.addText('爱快路由器');
      title.font = Font.boldSystemFont(16);
      title.textColor = new Color('#FCFCFC');
      widget.addSpacer(6);

      const usage = widget.addText(`CPU ${cpu}%  ·  内存 ${memory}%`);
      usage.font = Font.systemFont(13);
      usage.textColor = new Color('#FFB444');
      widget.addSpacer(5);

      const rate = widget.addText(
        `↑ ${formatBytes(stream.upload)}/s\n↓ ${formatBytes(stream.download)}/s`
      );
      rate.font = Font.mediumSystemFont(14);
      rate.textColor = new Color('#FCFCFC');
      widget.addSpacer();

      const footer = widget.addText(`在线 ${formatTime(stream.uptime)}`);
      footer.font = Font.systemFont(11);
      footer.textColor = new Color('#A8B0C0');
      return attachMenuURL(widget);
    }

    const stack = widget.addStack();
    stack.centerAlignContent();

    // 总上传下载
    const subStack = stack.addStack();
    subStack.layoutVertically();
    subStack.topAlignContent();

    const logo = await new Request(
      "https://cdn.jsdelivr.net/gh/zkl2333/scriptable/image/ikuai64.ico"
    ).loadImage();

    const logoStack = subStack.addStack();
    const logoImg = logoStack.addImage(logo);
    logoImg.imageSize = new Size(20, 20);
    logoStack.addSpacer(5);
    logoStack.addText("爱快").textColor = new Color("#FCFCFC");

    subStack.addSpacer(10);

    const uploadText = subStack.addText(
      `累计上传  ${formatBytes(stream.total_up)}`
    );
    uploadText.textColor = new Color("#FCFCFC"); // 设置文本颜色为白色
    uploadText.centerAlignText(); // 文本居中对齐

    subStack.addSpacer(4);

    const downloadText = subStack.addText(
      `累计下载  ${formatBytes(stream.total_down)}`
    );
    downloadText.textColor = new Color("#FCFCFC"); // 设置文本颜色为白色
    downloadText.centerAlignText(); // 文本居中对齐
    subStack.addSpacer(8);

    const rateText = subStack.addText(
      `↑ ${formatBytes(stream.upload)}/s\n↓ ${formatBytes(stream.download)}/s`
    );
    rateText.font = Font.mediumSystemFont(12);
    rateText.textColor = new Color('#A8B0C0');
    rateText.lineLimit = 2;

    subStack.addSpacer(6);
    const uptimeText = subStack.addText(`在线 ${formatTime(stream.uptime)}`);
    uptimeText.font = Font.systemFont(10);
    uptimeText.textColor = new Color('#A8B0C0');
    uptimeText.lineLimit = 1;

    stack.addSpacer(10);

    // CPU 环形进度条
    const ringSize = family === 'large' ? 118 : 88;
    const cpuImg = drawCircularProgress({
      center: new Point(100, 100),
      radius: 80,
      lineWidth: 15,
      progress: cpu / 100,
      backgroundColor: new Color("#333A52"),
      progressColor: new Color("#FFB444"),
      textLarge: cpu + "%",
      textSmall: "CPU",
      textColor: new Color("#FCFCFC"),
    });

    // 内存环形进度条
    const memoryImg = drawCircularProgress({
      center: new Point(100, 100),
      radius: 80,
      lineWidth: 15,
      progress: memory / 100,
      backgroundColor: new Color("#333A52"),
      progressColor: new Color("#F15A4B"),
      textLarge: memory + "%",
      textSmall: "内存",
      textColor: new Color("#FCFCFC"),
    });

    const cpuImage = stack.addImage(cpuImg);
    cpuImage.imageSize = new Size(ringSize, ringSize);
    stack.addSpacer(8);
    const memoryImage = stack.addImage(memoryImg);
    memoryImage.imageSize = new Size(ringSize, ringSize);
  } catch (error) {
    const title = widget.addText('爱快数据获取失败');
    title.font = Font.boldSystemFont(14);
    title.textColor = new Color('#F15A4B');
    widget.addSpacer(6);
    const message = widget.addText(error.message || '未知错误');
    message.font = Font.systemFont(11);
    message.textColor = new Color('#FCFCFC');
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
