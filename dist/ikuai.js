// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: network-wired;
// @script-id ikuai
// @version 1.1.0

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
  const checkForUpdate2 = async ({ force = false } = {}) => {
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
  const applyUpdateIfAny = async ({ interactive = false, force = interactive } = {}) => {
    const update = await checkForUpdate2({ force });
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
  return { applyUpdateIfAny, autoUpdate, checkForUpdate: checkForUpdate2 };
};

// src/lib/widget-menu.js
var showMessage = async (title, message) => {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("好");
  await alert.presentAlert();
};
var checkForUpdate = async ({ updater: updater2, version }) => {
  try {
    const update = await updater2.checkForUpdate({ force: true });
    if (!update) {
      await showMessage("已是最新", `当前 v${version}`);
      return false;
    }
    const confirm = new Alert();
    confirm.title = `发现新版本 v${update.version}`;
    confirm.message = `是否更新 ${Script.name()}？`;
    confirm.addAction("更新");
    confirm.addCancelAction("取消");
    if (await confirm.presentAlert() !== 0) return false;
    const updated = await updater2.applyUpdateIfAny({ force: true });
    if (!updated) {
      await showMessage("更新未完成", "远端版本已变化，请重新检查。");
      return false;
    }
    await showMessage("更新完成", "脚本已更新，请重新运行。");
    return true;
  } catch (error) {
    await showMessage("检查失败", String(error));
    return false;
  }
};
var shouldShowWidgetMenu = () => config.runsInApp && !config.runsWithSiri && !config.runsInActionExtension;
var attachMenuURL = (widget) => {
  widget.url = URLScheme.forRunningScript();
  return widget;
};
var presentWidget = async (widget, fallbackFamily = "medium") => {
  const family = fallbackFamily;
  if (family === "large") return widget.presentLarge();
  if (family === "small") return widget.presentSmall();
  return widget.presentMedium();
};
var selectPreviewFamilies = async () => {
  const alert = new Alert();
  alert.title = "预览组件";
  alert.message = "测试桌面组件在各种尺寸下的显示效果";
  alert.addAction("小尺寸 Small");
  alert.addAction("中尺寸 Medium");
  alert.addAction("大尺寸 Large");
  alert.addAction("全部 All");
  alert.addCancelAction("取消操作");
  switch (await alert.presentSheet()) {
    case 0:
      return ["small"];
    case 1:
      return ["medium"];
    case 2:
      return ["large"];
    case 3:
      return ["small", "medium", "large"];
    default:
      return null;
  }
};
var presentWidgetPreviews = async (createWidget2, families) => {
  for (const family of families) {
    await presentWidget(await createWidget2(family), family);
  }
};
var runWidgetMenu = async ({
  title,
  message = "",
  version,
  updater: updater2,
  actions = []
}) => {
  const alert = new Alert();
  alert.title = title;
  alert.message = message || `当前版本 v${version}`;
  alert.addAction("预览组件");
  actions.forEach((action) => alert.addAction(action.title));
  alert.addAction("检查更新");
  alert.addCancelAction("取消操作");
  const index = await alert.presentSheet();
  if (index === -1) return null;
  if (index === 0) {
    const families = await selectPreviewFamilies();
    return families ? { action: "preview", families } : null;
  }
  const actionIndex = index - 1;
  if (actionIndex < actions.length) return { action: actions[actionIndex].id };
  await checkForUpdate({ updater: updater2, version });
  return null;
};

// src/widgets/ikuai.js
var updater = createUpdater({
  scriptId: "ikuai",
  version: "1.1.0",
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
        const sessionCookie = request.response.cookies.find(
          (cookie) => cookie.name === "sess_key"
        );
        if (!sessionCookie) throw new Error("登录响应未提供 sess_key Cookie");
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
    const sessionKey = String(this.accessKey || accessKey || "").replace(/^sess_key=/, "");
    if (!sessionKey) {
      throw new Error("ERR_NOT_LOGGED_IN");
    }
    let url = `${this.protocol}://${this.host}:${this.port}/Action/call`;
    try {
      let request = new Request(url);
      request.method = "POST";
      request.headers = {
        "Content-Type": "application/json;charset=UTF-8",
        Cookie: `username=${this.username || ""}; login=1; sess_key=${sessionKey}`
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
  const value = Math.max(0, Number(bytes) || 0);
  if (value === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(value) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((value / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};
var avg = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return "0.00";
  const num = arr.map((item) => parseInt(item.replace("%", "")));
  const sum = num.reduce((acc, cur) => acc + cur, 0);
  return (sum / arr.length).toFixed(2);
};
var formatTime = (time) => {
  const totalSeconds = Math.max(0, Math.floor(Number(time) || 0));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor(totalSeconds % 86400 / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分`;
};
var getRouterError = (response) => {
  const code = response?.code ?? response?.Result ?? response?.result ?? "未知响应";
  const message = response?.ErrMsg || response?.Message || response?.message;
  return message ? `接口错误 ${code}: ${message}` : `接口错误 ${code}: 未返回系统状态`;
};
var getRouterData = (response) => {
  if (response?.code === 0) return response.results;
  if (response?.Result === 3e4) return response.Data;
  return null;
};
var getKeyChain = (key) => {
  if (Keychain.contains(key)) {
    return Keychain.get(key);
  }
  return null;
};
var loadStoredInfo = () => ({
  username: getKeyChain("ikuai_username") || "",
  password: getKeyChain("ikuai_password") || "",
  host: getKeyChain("ikuai_host") || "",
  port: getKeyChain("ikuai_port") || ""
});
var saveInfo = (info) => {
  Keychain.set("ikuai_username", info.username);
  Keychain.set("ikuai_password", info.password);
  Keychain.set("ikuai_host", info.host);
  Keychain.set("ikuai_port", info.port);
};
var configureRouter = async () => {
  const current = loadStoredInfo();
  const alert = new Alert();
  alert.title = "设置爱快路由器信息";
  alert.addTextField("username", current.username);
  if (typeof alert.addSecureTextField === "function") {
    alert.addSecureTextField("password", current.password);
  } else {
    alert.addTextField("password", current.password);
  }
  alert.addTextField("host", current.host);
  alert.addTextField("port", current.port);
  alert.addAction("保存");
  alert.addCancelAction("取消");
  if (await alert.presentAlert() !== 0) return null;
  const info = {
    username: alert.textFieldValue(0).trim(),
    password: alert.textFieldValue(1),
    host: alert.textFieldValue(2).trim(),
    port: alert.textFieldValue(3).trim()
  };
  saveInfo(info);
  return info;
};
var getWidgetInfo = () => {
  const parameter = String(args.widgetParameter || "").trim();
  const info = parameter ? createInfo(parameter) : loadStoredInfo();
  if (!info.username || !info.password || !info.host || !info.port) {
    throw new Error("请先在 Scriptable App 内运行脚本，完成爱快路由器配置");
  }
  saveInfo(info);
  return info;
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
  textColor,
  fontLarge = 36,
  fontSmall = 22
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
  const deg = Math.floor(360 * Math.min(Math.max(Number(progress) || 0, 0), 1));
  const canvWidth = lineWidth;
  for (let t = 0; t < deg; t++) {
    const rect_x = center.x + radius * Math.sin(t * Math.PI / 180) - canvWidth / 2;
    const rect_y = center.y - radius * Math.cos(t * Math.PI / 180) - canvWidth / 2;
    const rect_r = new Rect(rect_x, rect_y, canvWidth, canvWidth);
    ctx.setFillColor(progressColor);
    ctx.fillEllipse(rect_r);
  }
  ctx.setTextAlignedCenter();
  ctx.setFont(Font.boldSystemFont(fontLarge));
  ctx.setTextColor(textColor);
  ctx.drawTextInRect(
    textLarge,
    new Rect(center.x - 100, center.y - fontLarge, 200, fontLarge + 4)
  );
  ctx.setFont(Font.systemFont(fontSmall));
  ctx.setTextColor(textColor);
  ctx.drawTextInRect(
    textSmall,
    new Rect(center.x - 100, center.y + fontSmall * 0.7, 200, fontSmall + 8)
  );
  return ctx.getImage();
}
var COLORS = {
  bgTop: "#1B212B",
  bgBottom: "#12161D",
  text: "#F2F5F9",
  muted: "#8B96A8",
  down: "#4DA3FF",
  up: "#3ED598",
  cpu: "#FFB444",
  mem: "#FF6B5E",
  ringTrack: "#2C3442",
  divider: "#2A303C"
};
var LOGO_URL = "https://cdn.jsdelivr.net/gh/zkl2333/scriptable/image/ikuai64.ico";
var splitRate = (bytesPerSec) => {
  const text = formatBytes(Math.max(0, Number(bytesPerSec) || 0));
  const [value, unit] = text.split(" ");
  return { value, unit: unit === "Bytes" ? "B/s" : `${unit}/s` };
};
var collectMetrics = (sysstat) => {
  const stream = sysstat.stream || {};
  const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const rawUptime = stream.uptime ?? sysstat.uptime;
  let uptime = "—";
  if (rawUptime !== void 0 && rawUptime !== null && rawUptime !== "") {
    uptime = typeof rawUptime === "number" ? formatTime(rawUptime) : String(rawUptime);
  }
  return {
    cpu: Math.round(Number(avg(sysstat.cpu)) || 0),
    mem: parseInt(String(sysstat.memory?.used || "0%").replace("%", ""), 10) || 0,
    rateUp: toNumber(stream.upload),
    rateDown: toNumber(stream.download),
    totalUp: toNumber(stream.total_up),
    totalDown: toNumber(stream.total_down),
    connections: stream.connect_num != null ? toNumber(stream.connect_num) : null,
    uptime
  };
};
var drawBarImage = (progress, colorHex) => {
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
var addHDivider = (stack) => {
  const line = stack.addStack();
  line.size = new Size(0, 1);
  line.backgroundColor = new Color(COLORS.divider);
};
var addVDivider = (stack) => {
  const line = stack.addStack();
  line.size = new Size(1, 0);
  line.backgroundColor = new Color(COLORS.divider);
};
var addArrowIcon = (row, symbolName, colorHex, size = new Size(9, 11)) => {
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
var buildHeader = (widget, logo, uptimeText, { compact = false } = {}) => {
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
  const uptime = row.addText(`在线 ${uptimeText}`);
  uptime.font = Font.mediumSystemFont(9);
  uptime.textColor = new Color(COLORS.muted);
};
var addRateCell = (parent, label, symbolName, rateBytes, colorHex) => {
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
  valueText.font = Font.semiboldSystemFont(15);
  valueText.textColor = new Color(COLORS.text);
  valueRow.addSpacer(3);
  const unitText = valueRow.addText(unit);
  unitText.font = Font.systemFont(9);
  unitText.textColor = new Color(COLORS.muted);
};
var addGaugeCell = (parent, label, percent, colorHex, barWidth = 60) => {
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
var addInfoCell = (parent, label, value) => {
  const cell = parent.addStack();
  cell.layoutVertically();
  const labelText = cell.addText(label);
  labelText.font = Font.mediumSystemFont(9);
  labelText.textColor = new Color(COLORS.muted);
  cell.addSpacer(3);
  const valueText = cell.addText(value);
  valueText.font = Font.semiboldSystemFont(12);
  valueText.textColor = new Color(COLORS.text);
};
var addTotalsLine = (parent, metrics) => {
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
var addRing = (parent, image, size) => {
  const img = parent.addImage(image);
  img.imageSize = new Size(size, size);
};
var buildSmallLayout = (widget, metrics, logo) => {
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
var buildMediumLayout = (widget, metrics, logo, rings) => {
  buildHeader(widget, logo, metrics.uptime);
  widget.addSpacer(10);
  const main = widget.addStack();
  main.centerAlignContent();
  const gaugeStack = main.addStack();
  gaugeStack.centerAlignContent();
  addRing(gaugeStack, rings.cpu, rings.size);
  gaugeStack.addSpacer(8);
  addRing(gaugeStack, rings.mem, rings.size);
  main.addSpacer(16);
  addVDivider(main);
  main.addSpacer(16);
  const right = main.addStack();
  right.layoutVertically();
  const rateRow = right.addStack();
  addRateCell(rateRow, "下行", "arrow.down", metrics.rateDown, COLORS.down);
  rateRow.addSpacer();
  addRateCell(rateRow, "上行", "arrow.up", metrics.rateUp, COLORS.up);
  right.addSpacer(10);
  addHDivider(right);
  right.addSpacer(10);
  addTotalsLine(right, metrics);
};
var buildLargeLayout = (widget, metrics, logo, rings, updatedAt) => {
  buildHeader(widget, logo, metrics.uptime);
  widget.addSpacer(18);
  const main = widget.addStack();
  main.centerAlignContent();
  const gaugeStack = main.addStack();
  gaugeStack.centerAlignContent();
  addRing(gaugeStack, rings.cpu, rings.size);
  gaugeStack.addSpacer(14);
  addRing(gaugeStack, rings.mem, rings.size);
  main.addSpacer(18);
  addVDivider(main);
  main.addSpacer(18);
  const right = main.addStack();
  right.layoutVertically();
  const rateRow = right.addStack();
  addRateCell(rateRow, "实时下行", "arrow.down", metrics.rateDown, COLORS.down);
  rateRow.addSpacer();
  addRateCell(rateRow, "实时上行", "arrow.up", metrics.rateUp, COLORS.up);
  right.addSpacer(14);
  addHDivider(right);
  right.addSpacer(14);
  const totalsRow = right.addStack();
  addInfoCell(totalsRow, "累计下行", formatBytes(metrics.totalDown));
  totalsRow.addSpacer();
  addInfoCell(totalsRow, "累计上行", formatBytes(metrics.totalUp));
  widget.addSpacer(18);
  addHDivider(widget);
  widget.addSpacer(14);
  const strip = widget.addStack();
  addInfoCell(strip, "在线时长", metrics.uptime);
  strip.addSpacer();
  if (metrics.connections != null) {
    addInfoCell(strip, "连接数", String(metrics.connections));
    strip.addSpacer();
  }
  addInfoCell(strip, "更新时刻", updatedAt);
};
async function createWidget(info, family = config.widgetFamily || "medium") {
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
    const response = await myRouter.exec("homepage", "show", {
      TYPE: "sysstat"
    });
    const stats = getRouterData(response)?.sysstat;
    if (!stats) {
      console.log(JSON.stringify(response));
      throw new Error(getRouterError(response));
    }
    const metrics = collectMetrics(stats);
    const logo = await new Request(LOGO_URL).loadImage();
    let rings = null;
    if (family !== "small") {
      const ringSize = family === "large" ? 84 : 62;
      const ringFonts = family === "large" ? { fontLarge: 38, fontSmall: 24 } : { fontLarge: 42, fontSmall: 28 };
      const drawRing = (percent, label, colorHex) => drawCircularProgress({
        center: new Point(100, 100),
        radius: 82,
        lineWidth: 15,
        progress: percent / 100,
        backgroundColor: new Color(COLORS.ringTrack),
        progressColor: new Color(colorHex),
        textLarge: percent + "%",
        textSmall: label,
        textColor: new Color(COLORS.text),
        ...ringFonts
      });
      rings = {
        size: ringSize,
        cpu: drawRing(metrics.cpu, "CPU", COLORS.cpu),
        mem: drawRing(metrics.mem, "内存", COLORS.mem)
      };
    }
    const now = /* @__PURE__ */ new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const updatedAt = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (family === "small") {
      buildSmallLayout(widget, metrics, logo);
    } else if (family === "large") {
      buildLargeLayout(widget, metrics, logo, rings, updatedAt);
    } else {
      buildMediumLayout(widget, metrics, logo, rings);
    }
  } catch (error) {
    const failure = widget.addText("获取数据失败");
    failure.font = Font.mediumSystemFont(12);
    failure.textColor = new Color(COLORS.mem);
    const message = widget.addText(error.message || "未知错误");
    message.font = Font.systemFont(10);
    message.textColor = new Color(COLORS.muted);
    message.minimumScaleFactor = 0.65;
    console.log(error);
  }
  return attachMenuURL(widget);
}
if (shouldShowWidgetMenu()) {
  for (; ; ) {
    const action = await runWidgetMenu({
      title: "爱快路由器",
      version: "1.1.0",
      updater,
      actions: [
        {
          id: "settings",
          icon: "⚙",
          title: "配置路由器",
          subtitle: "保存用户名、密码、地址和端口"
        }
      ]
    });
    if (!action) break;
    if (action.action === "settings") {
      const info = await configureRouter();
      if (info) await presentWidgetPreviews((family) => createWidget(info, family), ["medium"]);
      break;
    }
    if (action.action === "preview") {
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
