// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: magic;
const request = new Request("https://v1.hitokoto.cn/?c=d&encode=text")

const runder = async ()=>{          
  const widget = new ListWidget()
  const textWidget = widget.addText("loading...")
  textWidget.centerAlignText()
  textWidget.font = Font.systemFont(24)
  const text = await request.loadString()
  textWidget.text = text
  Script.setWidget(widget)
  Script.complete()
}

runder()