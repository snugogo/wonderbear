export default {
  common: {
    ok: '确认',
    back: '返回',
    cancel: '取消',
    confirm: '确定',
    yes: '好的',
    no: '不要',
    loading: '加载中…',
    retry: '再试一次',
    settings: '设置',
  },

  boot: {
    welcome: 'WonderBear',
    initializing: '熊熊准备中…',
  },

  activation: {
    title: '欢迎来到 WonderBear',
    subtitle: '和小熊一起,探索新故事',
    scanHint: '家长扫码,让小熊认识你',
    waitingHint: '等爸爸妈妈扫码完成,熊熊就来啦',
    fallbackUrl: '扫不到?在浏览器打开',
    activationCodeLabel: '激活码',
    waitingForBinding: '等待绑定中…',
    bindingDone: '熊熊认识你啦!',
  },

  home: {
    greeting: '嗨,{name}!',
    greetingDefault: '嗨,小朋友!',
    coins: '金币',
    switchChild: '切换孩子',
    menus: {
      create: '创作小屋',
      stories: '故事世界',
      library: '我的小书屋',
      explore: '一起看看',
      profile: '我的家',
      cast: '投屏播放',
    },
    menuComingSoon: '敬请期待',
  },

  dialogue: {
    progress: '第 {current} 个问题,共 {total} 个',
    pressVoiceKey: '按一下遥控器的话筒键告诉我',
    listening: '熊熊在听…',
    thinking: '熊熊在想…',
    speaking: '熊熊在说…',
    earlyEndHint: '不想说就按 OK 键,熊熊就开始画啦~',
    didNotHear: '熊熊没听清,再说一次好吗?',
    willPaintNow: '熊熊先把这些画成故事,下次再继续哦~',
    starting: '熊熊准备好啦,马上开始~',
  },

  generating: {
    title: '小熊正在给你画故事…',
    progress: '已画完第 {ready} 页 / 共 {total} 页',
    elapsed: '已用 {seconds} 秒',
    almostDone: '马上画完啦~',
  },

  story: {
    pageOf: '第 {current} 页 / 共 {total} 页',
    finished: '故事讲完啦,晚安',
    playAgain: '再听一次',
    backToLibrary: '回小书屋',
  },

  library: {
    title: '我的小书屋',
    empty: '小书屋还空空的,去创作小屋画一本吧~',
    capacity: '本地 {used}/{max} 本',
    favorited: '已收藏',
    download: '下载到本地',
    delete: '删除',
    deleteConfirm: '真的删掉这本故事吗?',
  },

  profile: {
    title: '我的家',
    subscriptionFree: '免费用户',
    subscriptionMonthly: '月度会员',
    subscriptionYearly: '年度会员',
    storiesRemaining: '剩余 {count} 本',
    settings: {
      bgm: '背景音乐',
      learning: '识字模式',
      autoPlay: '自动翻页',
      language: '语言',
    },
  },

  offline: {
    title: '网络不通了',
    subtitle: '检查一下 WiFi?',
    available: '已下载的故事还能听哦',
    retry: '重新连接',
  },

  error: {
    title: '熊熊遇到了一点小问题',
    retry: '再试一次',
    backHome: '回首页',
  },

  dev: {
    panelTitle: '开发者面板',
    simulateVoiceDown: '模拟语音键(按下)',
    simulateVoiceUp: '模拟语音键(松开)',
    simulateOffline: '模拟断网',
    simulateOnline: '模拟联网',
    simulateActivated: '模拟激活成功',
    jumpScreen: '跳转屏幕',
    showFocus: '当前焦点',
    showMemory: '内存占用',
    triggerError: '触发错误',
  },
};
