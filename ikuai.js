// 配置信息
const info = {
  host: "192.168.31.1",
  port: 80,
  username: "admin",
  password: "--------",
};

// MD5 实现
var MD5 = function (string) {
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
        this.accessKey =
          request.response.cookies[0].name +
          "=" +
          request.response.cookies[0].value;
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
        Cookie: go_accesskey,
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

// 格式化字节
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

// 百分比字符串平均数
const avg = (arr) => {
  const num = arr.map((item) => parseInt(item.replace("%", "")));
  const sum = num.reduce((acc, cur) => acc + cur, 0);
  return (sum / arr.length).toFixed(2);
};

// 格式化时间
const formatTime = (time) => {
  const seconds = time % 60;
  const minutes = Math.floor((time / 60) % 60);
  const hours = Math.floor(time / 3600);

  return `${hours}小时${minutes}分钟${seconds}秒`;
};

async function createWidget() {
  const widget = new ListWidget();
  widget.setPadding(10, 10, 10, 10);

  try {
    const myRouter = new iKuai(info.host, info.port, false);
    await myRouter.login(info.username, info.password);

    const sysstat = await myRouter.exec("homepage", "show", {
      TYPE: "sysstat",
    });

    widget.addText(`CPU使用率: ${avg(sysstat.Data.sysstat.cpu)}%`);
    widget.addText(`内存使用率: ${sysstat.Data.sysstat.memory.used}%`);
    widget.addText(
      `总上传: ${formatBytes(sysstat.Data.sysstat.stream.total_up)}`
    );
    widget.addText(
      `总下载: ${formatBytes(sysstat.Data.sysstat.stream.total_down)}`
    );
    widget.addText(
      `当前上传速度: ${formatBytes(sysstat.Data.sysstat.stream.upload)}/s`
    );
    widget.addText(
      `当前下载速度: ${formatBytes(sysstat.Data.sysstat.stream.download)}/s`
    );
    widget.addText(`总在线时间: ${formatTime(sysstat.Data.sysstat.uptime)}`);
  } catch (error) {
    widget.addText("获取数据失败");
    console.log(error);
  }

  return widget;
}

const widget = await createWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentMedium();
}
Script.complete();
