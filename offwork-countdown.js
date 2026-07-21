// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: magic;
// 定义时间
const startDate = new Date(new Date().setHours(9, 30, 0))
const endDate = new Date(new Date().setHours(18, 0, 0))
const nowDate = new Date()

const isWorkTime = startDate < nowDate && nowDate < endDate
const isWeekDay = [0, 6].includes(nowDate.getDay())
log(nowDate.getDay())

const setRefreshAfterDat = (widget) => {
  const dayEndDate = new Date(new Date().setHours(23, 59, 59))
  if (isWorkTime) {
    widget.refreshAfterDate = endDate
  } else if (nowDate > endDate) {
    widget.refreshAfterDate = dayEndDate
  } else {
    widget.refreshAfterDate = startDate
  }
}

// 创建小部件
const widget = new ListWidget()
widget.spacing = 12
widget.url = 'scriptable:///run?scriptName=' + encodeURIComponent(Script.name()) + '&arg=test'
setRefreshAfterDat(widget)

// 添加渐变色背景
// const gradient = new LinearGradient()
// gradient.locations = [0, 1]
// gradient.colors = [new Color('#333'), new Color('#333')]
// widget.backgroundGradient = gradient

// 添加文本元素
const titleText = widget.addText(isWorkTime ? '距离下班还有‍' : '下班啦')
// text.textColor = new Color('#fff')
titleText.font = Font.boldSystemFont(40)
titleText.centerAlignText()

if (isWorkTime) {
  // 添加时间元素
  const widgetData = widget.addDate(endDate)
  // widgetData.textColor = new Color('#fff')
  widgetData.font = Font.boldSystemFont(32)  
  widgetData.applyRelativeStyle()
  widgetData.centerAlignText()
} else {
  titleText.font = Font.boldSystemFont(24)
  const widgetData = widget.addDate(new Date(new Date().setHours(0, 0, 0)))
  widgetData.applyTimerStyle()
  widgetData.centerAlignText()
  widgetData.font = Font.boldSystemFont(52)
}

// const weekText = widget.addText(isWeekDay ? '今天是周末' : '今天不是周末')
// weekText.textColor = new Color('#fff')
// weekText.font = Font.boldSystemFont(12)
// weekText.centerAlignText()

// 设置部件
Script.setWidget(widget)

if (!config.runsInWidget) {
  const alert = new Alert()
  alert.title = '非桌面环境执行了组件代码'
  alert.message = '传递过来的参数是：' + args['queryParameters']['arg']
  alert.addAction('预览组件')
  alert.addCancelAction('取消')
  alert
    .presentAlert()
    .then((index) => {
      switch (index) {
        case 0:
          widget.presentMedium()
          break
      }
    })
    .then(() => {
      Script.complete()
    })
}
