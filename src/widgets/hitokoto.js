import { createUpdater } from '../lib/updater.js';

const updater = createUpdater({
  scriptId: __SCRIPT_ID__,
  version: __SCRIPT_VERSION__,
  updateURL: __UPDATE_URL__,
});
await updater.autoUpdate();

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
