// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: coffee;
if(config.runsInWidget){
  const widget = new ListWidget()
  const text = widget.addText("来一杯")
  widget.url = "eleme://"
  Script.setWidget(widget)
} else if (config.runsInApp){
  const notifi = new Notification()
  notifi.title = "提醒提醒喝奶茶小助手喝奶茶小助手"
  notifi.body = "提醒提醒喝奶茶小助手喝奶茶小助手提醒你喝奶茶啦！"
  notifi.identifier = "naicha"
  notifi.addAction("发朋友圈提醒大家喝奶茶", "weixin://")
  notifi.addAction("查找附近奶茶店", "http://maps.apple.com/?q="+encodeURI("奶茶"))
  notifi.addAction("打开饿了吗", "eleme://")
  notifi.addAction("打开美团", "imeituan://")
  notifi.setTriggerDate(new Date(Date.now()+3000))
  notifi.schedule()
}