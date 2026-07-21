// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: network-wired;
// @script-id ikuai
// @version 1.0.1

// src/lib/updater.js
var DEFAULT_CHECK_INTERVAL = 24 * 3600;
var UPDATE_KEY_PREFIX = "zkl2333.widgetUpdater";
var compareVersions = (left, right) => {
  const leftParts = String(left).split(".").map((part) => Number(part) || 0);
  const rightParts = String(right).split(".").map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let i = 0; i < length; i++) {
    const difference = (leftParts[i] || 0) - (rightParts[i] || 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
};
var readMetadata = (source) => ({
  scriptId: source.match(/@script-id\s+([a-z0-9-]+)/i)?.[1],
  version: source.match(/@version\s+([0-9]+(?:\.[0-9]+){1,2})/)?.[1]
});
var getTargetFileManager = (filePath) => {
  try {
    const iCloud = FileManager.iCloud();
    if (iCloud.isFileStoredIniCloud(filePath)) return iCloud;
  } catch {
  }
  return FileManager.local();
};
var saveBackup = (scriptId, source) => {
  const local = FileManager.local();
  const backupDir = local.joinPath(local.libraryDirectory(), "widget-update-backups");
  if (!local.fileExists(backupDir)) local.createDirectory(backupDir, true);
  local.writeString(local.joinPath(backupDir, `${scriptId}.js.bak`), source);
};
var createUpdater = ({
  scriptId,
  version,
  updateURL,
  checkInterval = DEFAULT_CHECK_INTERVAL
}) => {
  const checkedAtKey = `${UPDATE_KEY_PREFIX}.${scriptId}.checkedAt`;
  const checkForUpdate = async ({ force = false } = {}) => {
    const lastCheckedAt = Keychain.contains(checkedAtKey) ? Number(Keychain.get(checkedAtKey)) : 0;
    const now = Math.floor(Date.now() / 1e3);
    if (!force && now - lastCheckedAt < checkInterval) return null;
    Keychain.set(checkedAtKey, String(now));
    const request = new Request(`${updateURL}?t=${Date.now()}`);
    request.timeoutInterval = 10;
    const source = await request.loadString();
    const metadata = readMetadata(source);
    if (metadata.scriptId !== scriptId) {
      throw new Error(`更新文件标识不匹配：${metadata.scriptId || "missing"}`);
    }
    if (!metadata.version) throw new Error("更新文件缺少版本号");
    if (source.length < 200) throw new Error("更新文件内容不完整");
    if (compareVersions(metadata.version, version) <= 0) return null;
    return { source, version: metadata.version };
  };
  const applyUpdateIfAny = async ({ interactive = false } = {}) => {
    const update = await checkForUpdate({ force: interactive });
    if (!update) return false;
    if (interactive) {
      const alert = new Alert();
      alert.title = `发现新版本 v${update.version}`;
      alert.message = `是否更新 ${Script.name()}？`;
      alert.addAction("更新");
      alert.addCancelAction("取消");
      if (await alert.presentAlert() !== 0) return false;
    }
    const targetPath = module.filename;
    if (!targetPath) throw new Error("无法定位当前脚本文件");
    const fileManager = getTargetFileManager(targetPath);
    saveBackup(scriptId, fileManager.readString(targetPath));
    fileManager.writeString(targetPath, update.source);
    return true;
  };
  const autoUpdate = async () => {
    if (config.runsInApp && config.runsInActionExtension) return false;
    try {
      return await applyUpdateIfAny();
    } catch {
      return false;
    }
  };
  return { applyUpdateIfAny, autoUpdate, checkForUpdate };
};

// src/widgets/ikuai.js
var updater = createUpdater({
  scriptId: "ikuai",
  version: "1.0.1",
  updateURL: "https://raw.githubusercontent.com/zkl2333/scriptable/main/dist/ikuai.js"
});
await updater.autoUpdate();
var MD5 = function(string) {
  function RotateLeft(lValue, iShiftBits) {
    return lValue << iShiftBits | lValue >>> 32 - iShiftBits;
  }
  function AddUnsigned(lX, lY) {
    var lX4, lY4, lX8, lY8, lResult;
    lX8 = lX & 2147483648;
    lY8 = lY & 2147483648;
    lX4 = lX & 1073741824;
    lY4 = lY & 1073741824;
    lResult = (lX & 1073741823) + (lY & 1073741823);
    if (lX4 & lY4) {
      return lResult ^ 2147483648 ^ lX8 ^ lY8;
    }
    if (lX4 | lY4) {
      if (lResult & 1073741824) {
        return lResult ^ 3221225472 ^ lX8 ^ lY8;
      } else {
        return lResult ^ 1073741824 ^ lX8 ^ lY8;
      }
    } else {
      return lResult ^ lX8 ^ lY8;
    }
  }
  function F(x2, y, z) {
    return x2 & y | ~x2 & z;
  }
  function G(x2, y, z) {
    return x2 & z | y & ~z;
  }
  function H(x2, y, z) {
    return x2 ^ y ^ z;
  }
  function I(x2, y, z) {
    return y ^ (x2 | ~z);
  }
  function FF(a2, b2, c2, d2, x2, s, ac) {
    a2 = AddUnsigned(a2, AddUnsigned(AddUnsigned(F(b2, c2, d2), x2), ac));
    return AddUnsigned(RotateLeft(a2, s), b2);
  }
  function GG(a2, b2, c2, d2, x2, s, ac) {
    a2 = AddUnsigned(a2, AddUnsigned(AddUnsigned(G(b2, c2, d2), x2), ac));
    return AddUnsigned(RotateLeft(a2, s), b2);
  }
  function HH(a2, b2, c2, d2, x2, s, ac) {
    a2 = AddUnsigned(a2, AddUnsigned(AddUnsigned(H(b2, c2, d2), x2), ac));
    return AddUnsigned(RotateLeft(a2, s), b2);
  }
  function II(a2, b2, c2, d2, x2, s, ac) {
    a2 = AddUnsigned(a2, AddUnsigned(AddUnsigned(I(b2, c2, d2), x2), ac));
    return AddUnsigned(RotateLeft(a2, s), b2);
  }
  function ConvertToWordArray(string2) {
    var lWordCount;
    var lMessageLength = string2.length;
    var lNumberOfWords_temp1 = lMessageLength + 8;
    var lNumberOfWords_temp2 = (lNumberOfWords_temp1 - lNumberOfWords_temp1 % 64) / 64;
    var lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
    var lWordArray = Array(lNumberOfWords - 1);
    var lBytePosition = 0;
    var lByteCount = 0;
    while (lByteCount < lMessageLength) {
      lWordCount = (lByteCount - lByteCount % 4) / 4;
      lBytePosition = lByteCount % 4 * 8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | string2.charCodeAt(lByteCount) << lBytePosition;
      lByteCount++;
    }
    lWordCount = (lByteCount - lByteCount % 4) / 4;
    lBytePosition = lByteCount % 4 * 8;
    lWordArray[lWordCount] = lWordArray[lWordCount] | 128 << lBytePosition;
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
    return lWordArray;
  }
  function WordToHex(lValue) {
    var WordToHexValue = "", WordToHexValue_temp = "", lByte, lCount;
    for (lCount = 0; lCount <= 3; lCount++) {
      lByte = lValue >>> lCount * 8 & 255;
      WordToHexValue_temp = "0" + lByte.toString(16);
      WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
    }
    return WordToHexValue;
  }
  function Utf8Encode(string2) {
    string2 = string2.replace(/\r\n/g, "\n");
    var utftext = "";
    for (var n = 0; n < string2.length; n++) {
      var c2 = string2.charCodeAt(n);
      if (c2 < 128) {
        utftext += String.fromCharCode(c2);
      } else if (c2 > 127 && c2 < 2048) {
        utftext += String.fromCharCode(c2 >> 6 | 192);
        utftext += String.fromCharCode(c2 & 63 | 128);
      } else {
        utftext += String.fromCharCode(c2 >> 12 | 224);
        utftext += String.fromCharCode(c2 >> 6 & 63 | 128);
        utftext += String.fromCharCode(c2 & 63 | 128);
      }
    }
    return utftext;
  }
  var x = Array();
  var k, AA, BB, CC, DD, a, b, c, d;
  var S11 = 7, S12 = 12, S13 = 17, S14 = 22;
  var S21 = 5, S22 = 9, S23 = 14, S24 = 20;
  var S31 = 4, S32 = 11, S33 = 16, S34 = 23;
  var S41 = 6, S42 = 10, S43 = 15, S44 = 21;
  string = Utf8Encode(string);
  x = ConvertToWordArray(string);
  a = 1732584193;
  b = 4023233417;
  c = 2562383102;
  d = 271733878;
  for (k = 0; k < x.length; k += 16) {
    AA = a;
    BB = b;
    CC = c;
    DD = d;
    a = FF(a, b, c, d, x[k + 0], S11, 3614090360);
    d = FF(d, a, b, c, x[k + 1], S12, 3905402710);
    c = FF(c, d, a, b, x[k + 2], S13, 606105819);
    b = FF(b, c, d, a, x[k + 3], S14, 3250441966);
    a = FF(a, b, c, d, x[k + 4], S11, 4118548399);
    d = FF(d, a, b, c, x[k + 5], S12, 1200080426);
    c = FF(c, d, a, b, x[k + 6], S13, 2821735955);
    b = FF(b, c, d, a, x[k + 7], S14, 4249261313);
    a = FF(a, b, c, d, x[k + 8], S11, 1770035416);
    d = FF(d, a, b, c, x[k + 9], S12, 2336552879);
    c = FF(c, d, a, b, x[k + 10], S13, 4294925233);
    b = FF(b, c, d, a, x[k + 11], S14, 2304563134);
    a = FF(a, b, c, d, x[k + 12], S11, 1804603682);
    d = FF(d, a, b, c, x[k + 13], S12, 4254626195);
    c = FF(c, d, a, b, x[k + 14], S13, 2792965006);
    b = FF(b, c, d, a, x[k + 15], S14, 1236535329);
    a = GG(a, b, c, d, x[k + 1], S21, 4129170786);
    d = GG(d, a, b, c, x[k + 6], S22, 3225465664);
    c = GG(c, d, a, b, x[k + 11], S23, 643717713);
    b = GG(b, c, d, a, x[k + 0], S24, 3921069994);
    a = GG(a, b, c, d, x[k + 5], S21, 3593408605);
    d = GG(d, a, b, c, x[k + 10], S22, 38016083);
    c = GG(c, d, a, b, x[k + 15], S23, 3634488961);
    b = GG(b, c, d, a, x[k + 4], S24, 3889429448);
    a = GG(a, b, c, d, x[k + 9], S21, 568446438);
    d = GG(d, a, b, c, x[k + 14], S22, 3275163606);
    c = GG(c, d, a, b, x[k + 3], S23, 4107603335);
    b = GG(b, c, d, a, x[k + 8], S24, 1163531501);
    a = GG(a, b, c, d, x[k + 13], S21, 2850285829);
    d = GG(d, a, b, c, x[k + 2], S22, 4243563512);
    c = GG(c, d, a, b, x[k + 7], S23, 1735328473);
    b = GG(b, c, d, a, x[k + 12], S24, 2368359562);
    a = HH(a, b, c, d, x[k + 5], S31, 4294588738);
    d = HH(d, a, b, c, x[k + 8], S32, 2272392833);
    c = HH(c, d, a, b, x[k + 11], S33, 1839030562);
    b = HH(b, c, d, a, x[k + 14], S34, 4259657740);
    a = HH(a, b, c, d, x[k + 1], S31, 2763975236);
    d = HH(d, a, b, c, x[k + 4], S32, 1272893353);
    c = HH(c, d, a, b, x[k + 7], S33, 4139469664);
    b = HH(b, c, d, a, x[k + 10], S34, 3200236656);
    a = HH(a, b, c, d, x[k + 13], S31, 681279174);
    d = HH(d, a, b, c, x[k + 0], S32, 3936430074);
    c = HH(c, d, a, b, x[k + 3], S33, 3572445317);
    b = HH(b, c, d, a, x[k + 6], S34, 76029189);
    a = HH(a, b, c, d, x[k + 9], S31, 3654602809);
    d = HH(d, a, b, c, x[k + 12], S32, 3873151461);
    c = HH(c, d, a, b, x[k + 15], S33, 530742520);
    b = HH(b, c, d, a, x[k + 2], S34, 3299628645);
    a = II(a, b, c, d, x[k + 0], S41, 4096336452);
    d = II(d, a, b, c, x[k + 7], S42, 1126891415);
    c = II(c, d, a, b, x[k + 14], S43, 2878612391);
    b = II(b, c, d, a, x[k + 5], S44, 4237533241);
    a = II(a, b, c, d, x[k + 12], S41, 1700485571);
    d = II(d, a, b, c, x[k + 3], S42, 2399980690);
    c = II(c, d, a, b, x[k + 10], S43, 4293915773);
    b = II(b, c, d, a, x[k + 1], S44, 2240044497);
    a = II(a, b, c, d, x[k + 8], S41, 1873313359);
    d = II(d, a, b, c, x[k + 15], S42, 4264355552);
    c = II(c, d, a, b, x[k + 6], S43, 2734768916);
    b = II(b, c, d, a, x[k + 13], S44, 1309151649);
    a = II(a, b, c, d, x[k + 4], S41, 4149444226);
    d = II(d, a, b, c, x[k + 11], S42, 3174756917);
    c = II(c, d, a, b, x[k + 2], S43, 718787259);
    b = II(b, c, d, a, x[k + 9], S44, 3951481745);
    a = AddUnsigned(a, AA);
    b = AddUnsigned(b, BB);
    c = AddUnsigned(c, CC);
    d = AddUnsigned(d, DD);
  }
  var temp = WordToHex(a) + WordToHex(b) + WordToHex(c) + WordToHex(d);
  return temp.toLowerCase();
};
function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
var iKuai = class {
  constructor(host, port, https) {
    this.host = host;
    this.port = port;
    this.protocol = https ? "https" : "http";
  }
  async login(username, password) {
    let passwd = MD5(password);
    let pass = toBase64("salt_11" + password);
    let login_info = {
      passwd,
      pass,
      remember_password: "",
      username
    };
    let url = `${this.protocol}://${this.host}:${this.port}/Action/login`;
    try {
      let request = new Request(url);
      request.method = "POST";
      request.headers = { "Content-Type": "application/json" };
      request.body = JSON.stringify(login_info);
      let response = await request.loadJSON();
      if (response && response.Result == 1e4) {
        this.accessKey = request.response.cookies[0].name + "=" + request.response.cookies[0].value;
        return this.accessKey;
      } else {
        throw new Error(response);
      }
    } catch (error) {
      throw error;
    }
  }
  async exec(func, action, param, accessKey) {
    let go_accesskey = this.accessKey || accessKey;
    if (!go_accesskey) {
      throw new Error("ERR_NOT_LOGGED_IN");
    }
    let url = `${this.protocol}://${this.host}:${this.port}/Action/call`;
    try {
      let request = new Request(url);
      request.method = "POST";
      request.headers = {
        "Content-Type": "application/json",
        Cookie: go_accesskey
      };
      request.body = JSON.stringify({
        func_name: func,
        action,
        param
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
};
var createInfo = (str) => {
  const [username, password, host, port] = str.split(/[@:]/);
  return { host, port, username, password };
};
var formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};
var avg = (arr) => {
  const num = arr.map((item) => parseInt(item.replace("%", "")));
  const sum = num.reduce((acc, cur) => acc + cur, 0);
  return (sum / arr.length).toFixed(2);
};
var getKeyChain = (key) => {
  if (Keychain.contains(key)) {
    return Keychain.get(key);
  }
  return null;
};
function drawCircularProgress({
  center,
  radius,
  lineWidth,
  progress,
  backgroundColor,
  progressColor,
  textLarge,
  textSmall,
  textColor
}) {
  let ctx = new DrawContext();
  ctx.size = new Size(200, 200);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.setStrokeColor(backgroundColor);
  ctx.setLineWidth(lineWidth);
  ctx.strokeEllipse(
    new Rect(center.x - radius, center.y - radius, 2 * radius, 2 * radius)
  );
  const deg = Math.floor(360 * progress);
  const canvWidth = lineWidth;
  for (let t = 0; t < deg; t++) {
    const rect_x = center.x + radius * Math.sin(t * Math.PI / 180) - canvWidth / 2;
    const rect_y = center.y - radius * Math.cos(t * Math.PI / 180) - canvWidth / 2;
    const rect_r = new Rect(rect_x, rect_y, canvWidth, canvWidth);
    ctx.setFillColor(progressColor);
    ctx.fillEllipse(rect_r);
  }
  ctx.setTextAlignedCenter();
  ctx.setFont(Font.boldSystemFont(36));
  ctx.setTextColor(textColor);
  ctx.drawTextInRect(
    textLarge,
    new Rect(center.x - 100, center.y - 36, 200, 40)
  );
  ctx.setFont(Font.systemFont(22));
  ctx.setTextColor(textColor);
  ctx.drawTextInRect(
    textSmall,
    new Rect(center.x - 100, center.y + 15, 200, 30)
  );
  return ctx.getImage();
}
async function createWidget(info) {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#333333");
  widget.useDefaultPadding();
  try {
    const myRouter = new iKuai(info.host, info.port, false);
    await myRouter.login(info.username, info.password);
    const sysstat = await myRouter.exec("homepage", "show", {
      TYPE: "sysstat"
    });
    const stack = widget.addStack();
    stack.centerAlignContent();
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
    subStack.addSpacer(20);
    const uploadText = subStack.addText(
      `↑ ${formatBytes(sysstat.Data.sysstat.stream.total_up)}`
    );
    uploadText.textColor = new Color("#FCFCFC");
    uploadText.centerAlignText();
    subStack.addSpacer(5);
    const downloadText = subStack.addText(
      `↓ ${formatBytes(sysstat.Data.sysstat.stream.total_down)}`
    );
    downloadText.textColor = new Color("#FCFCFC");
    downloadText.centerAlignText();
    subStack.addSpacer(35);
    stack.addSpacer(10);
    const cpu = avg(sysstat.Data.sysstat.cpu);
    const cpuImg = drawCircularProgress({
      center: new Point(100, 100),
      radius: 80,
      lineWidth: 15,
      progress: cpu / 100,
      backgroundColor: new Color("#333A52"),
      progressColor: new Color("#FFB444"),
      textLarge: cpu + "%",
      textSmall: "CPU",
      textColor: new Color("#FCFCFC")
    });
    const memory = parseInt(sysstat.Data.sysstat.memory.used.replace("%", ""));
    const memoryImg = drawCircularProgress({
      center: new Point(100, 100),
      radius: 80,
      lineWidth: 15,
      progress: memory / 100,
      backgroundColor: new Color("#333A52"),
      progressColor: new Color("#F15A4B"),
      textLarge: memory + "%",
      textSmall: "内存",
      textColor: new Color("#FCFCFC")
    });
    stack.addImage(cpuImg);
    stack.addSpacer(10);
    stack.addImage(memoryImg);
  } catch (error) {
    widget.addText("获取数据失败");
    console.log(error);
    throw error;
  }
  return widget;
}
if (config.runsInApp) {
  const username = getKeyChain("ikuai_username") || "";
  const password = getKeyChain("ikuai_password") || "";
  const host = getKeyChain("ikuai_host") || "";
  const port = getKeyChain("ikuai_port") || "";
  const alert = new Alert();
  alert.title = "设置爱快路由器信息";
  alert.addTextField("username", username);
  alert.addSecureTextField("password", password);
  alert.addTextField("host", host);
  alert.addTextField("port", port);
  alert.addAction("确定");
  alert.addCancelAction("取消");
  const number = await alert.present();
  if (number === 0) {
    const username2 = alert.textFieldValue(0);
    const password2 = alert.textFieldValue(1);
    const host2 = alert.textFieldValue(2);
    const port2 = alert.textFieldValue(3);
    Keychain.set("ikuai_username", username2);
    Keychain.set("ikuai_password", password2);
    Keychain.set("ikuai_host", host2);
    Keychain.set("ikuai_port", port2);
    const info = { host: host2, port: port2, username: username2, password: password2 };
    const widget = await createWidget(info);
    widget.presentMedium();
  }
} else {
  const { host, port, username, password } = createInfo(args.widgetParameter);
  Keychain.set("ikuai_username", username);
  Keychain.set("ikuai_password", password);
  Keychain.set("ikuai_host", host);
  Keychain.set("ikuai_port", port);
  const widget = await createWidget({ host, port, username, password });
  Script.setWidget(widget);
}
Script.complete();
