// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-gray; icon-glyph: magic;
class CountHolidayWidget {
  constructor(e) {
    (this.arg = e),
      (this.widgetSize = config.widgetFamily),
      (this.ratio = Device.screenSize().width / 414);
  }
  render() {
    return "medium" === this.widgetSize
      ? this.renderMedium()
      : "large" === this.widgetSize
      ? this.renderLarge()
      : this.renderSmall();
  }
  renderSmall() {
    let e = new ListWidget();
    return e.addText("暂不支持该尺寸组件"), e;
  }
  renderMedium() {
    let e = new ListWidget(),
      t = 0,
      { total: r, used: i } = this.calculator(),
      n = e.addText(`2021年的休息日还剩 ${r - i} 天`);
    (n.font = new Font("PingFangSC-Semibold", 15 * this.ratio)),
      (n.textColor = new Color("#666666")),
      n.centerAlignText(),
      e.addSpacer(10 * this.ratio);
    for (let n = 0; n < 5; n++) {
      let n = e.addStack();
      for (let e = 0; e < 23; e++) {
        let e = n.addText("●");
        if (
          ((e.font = Font.lightSystemFont(16 * this.ratio)),
          (e.textColor = t < i ? new Color("#c35d55") : new Color("#008e9d")),
          ++t == r)
        )
          break;
      }
      if (t == r) break;
    }
    let o = new LinearGradient();
    return (
      (o.locations = [0, 1]),
      (o.colors = [new Color("#Fad300"), new Color("#F7A11C")]),
      (e.backgroundGradient = o),
      e
    );
  }
  renderLarge() {
    let e = new ListWidget(),
      t = 0,
      { total: r, used: i } = this.calculator(),
      n = e.addText(`2021年的休息日还剩 ${r - i} 天`);
    (n.font = new Font("PingFangSC-Semibold", 20 * this.ratio)),
      (n.textColor = new Color("#666666")),
      n.centerAlignText(),
      e.addSpacer(10 * this.ratio);
    for (let n = 0; n < 10; n++) {
      let n = e.addStack();
      for (let e = 0; e < 14; e++) {
        let e = n.addText("●");
        if (
          ((e.font = Font.lightSystemFont(25 * this.ratio)),
          (e.textColor = t < i ? new Color("#c35d55") : new Color("#008e9d")),
          ++t == r)
        )
          break;
      }
      if (t == r) break;
    }
    let o = new LinearGradient();
    return (
      (o.locations = [0, 1]),
      (o.colors = [new Color("#Fad300"), new Color("#F7A11C")]),
      (e.backgroundGradient = o),
      e
    );
  }
  calculator() {
    let e = [
      "0101",
      "0102",
      "0103",
      "0109",
      "0110",
      "0116",
      "0117",
      "0123",
      "0124",
      "0130",
      "0131",
      "0206",
      "0211",
      "0212",
      "0213",
      "0214",
      "0215",
      "0216",
      "0217",
      "0221",
      "0227",
      "0228",
      "0306",
      "0307",
      "0313",
      "0314",
      "0320",
      "0321",
      "0327",
      "0328",
      "0403",
      "0404",
      "0405",
      "0410",
      "0411",
      "0417",
      "0418",
      "0424",
      "0501",
      "0502",
      "0503",
      "0504",
      "0505",
      "0509",
      "0515",
      "0516",
      "0522",
      "0523",
      "0529",
      "0530",
      "0605",
      "0606",
      "0612",
      "0613",
      "0614",
      "0619",
      "0620",
      "0626",
      "0627",
      "0703",
      "0704",
      "0710",
      "0711",
      "0717",
      "0718",
      "0724",
      "0725",
      "0731",
      "0801",
      "0807",
      "0808",
      "0814",
      "0815",
      "0821",
      "0822",
      "0828",
      "0829",
      "0904",
      "0905",
      "0911",
      "0912",
      "0919",
      "0920",
      "0921",
      "0925",
      "1001",
      "1002",
      "1003",
      "1004",
      "1005",
      "1006",
      "1007",
      "1010",
      "1016",
      "1017",
      "1023",
      "1024",
      "1030",
      "1031",
      "1106",
      "1107",
      "1113",
      "1114",
      "1120",
      "1121",
      "1127",
      "1128",
      "1204",
      "1205",
      "1211",
      "1212",
      "1218",
      "1219",
      "1225",
      "1226",
    ];
    const t = (e) => {
        let t = (e = new Date(e)).getMonth() + 1,
          i = e.getDate();
        return `${r(t)}${r(i)}`;
      },
      r = (e) => ((e = e.toString())[1] ? e : "0" + e);
    let i = "",
      n = new Date();
    if (n.getFullYear() < 2021) return { total: e.length, used: 0 };
    for (n.getFullYear() > 2021 && (n = new Date("2021-12-31")); !e.includes(i); )
      (i = t(n)), (n -= 864e5);
    return { total: e.length, used: e.indexOf(i) + 1 };
  }
  init() {
    if (!config.runsInWidget) return;
    let e = this.render();
    Script.setWidget(e), Script.complete();
  }
}
new CountHolidayWidget(args.widgetParameter).init();
