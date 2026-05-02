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
    subtitle: '和小熊一起\nDiscover Story Book',
    scanHint: '家长扫码,让小熊认识你',
    waitingHint: '等爸爸妈妈扫码完成,熊熊就来啦',
    fallbackUrl: '扫不到?在浏览器打开',
    activationCodeLabel: '激活码',
    waitingForBinding: '等待绑定中…',
    bindingDone: '熊熊认识你啦!',
    skipButton: '跳过 / 体验免费版',
  },

  /*
   * TV v1.0 命名锁定 — §2.1 6 入口 4 字命名表:
   *   1. 来讲故事 / Create     → /create
   *   2. 故事乐园 / Stories    → /library
   *   3. 小熊星光 / Bear Stars → /leaderboard (新)
   *   4. 手机投屏 / Cast       → stub
   *   5. 小熊小屋 / My Den     → /profile
   *   6. 系统设置 / Settings   → stub
   * 旧 keys (createOld / storiesOld / libraryOld 等) 保留为兼容别名,
   * 现役屏全部走新 key.
   */
  home: {
    greeting: '嗨,{name}!',
    greetingDefault: '嗨,小朋友!',
    coins: '金币',
    switchChild: '切换孩子',
    stars: '星光',
    menus: {
      create: '来讲故事',
      stories: '故事乐园',
      bearStars: '小熊星光',
      cast: '手机投屏',
      myDen: '小熊小屋',
      settings: '系统设置',
      // 兼容旧 key,仍指向新文案
      library: '故事乐园',
      explore: '系统设置',
      profile: '小熊小屋',
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
    holdMicHint: '按住遥控器话筒说话,说完放开',
    readyPainter: '可以开画啦',
    /* v7.2: turn summary ribbon — "你刚说: …" 30 字以内. */
    youSaid: '你刚说:',
    retry: '改一改',
    send: '发送',
    confirm: '确认',
    magic: '魔法',
    micLocked: '熊熊已经收到啦~',
    /* WO-3.6: 屏幕话筒按钮(平板 / PC 浏览器走 UI 按钮触发 voice-key-down). */
    micButton: {
      idle: '按住说话',
      recording: '正在听...',
      aria: '按住说话录音',
    },
    demoQuestion: '今天想听一个关于什么的故事呀?',
    demoReply: '我想听一只勇敢的小熊去森林冒险的故事!',
    /*
     * WO-3.18 Phase 3 — 确认创作按钮文案. 在 dialogueState=waiting_confirm
     * 时按钮带 pulse 呼吸动效, 提示孩子点击进入绘本生成.
     */
    confirmCreate: '开始画故事',
    /* WO-3.18 Phase 4 — 草稿持久化 (localStorage) 的弹窗文案. */
    draft: {
      backConfirmTitle: '故事还没画,要保留吗?',
      backConfirmKeep: '保留草稿',
      backConfirmDiscard: '取消',
      recoverTitle: '上次聊了 {turns} 轮还没画,继续吗?',
      recoverContinue: '继续草稿',
      recoverNew: '新故事',
    },
  },

  /*
   * TV v1.0 §4.6: 分阶段进度文案 (按 percent 区间):
   *   0-10  → stages.thinking  '小熊在想故事呢...'
   *   10-30 → stages.firstPage '正在画第一页...'
   *   30-65 → stages.morePages '画其余 11 页...'
   *   65-95 → stages.recording '小熊在录音...'
   *   95+   → stages.almost    '快好了!'
   */
  /*
   * v7.2 §1.4 — StoryPreviewScreen
   * 在 dialogue done=true 之后, generating 之前, 显示 3-5 段故事大纲让小孩
   * 拍板 "就这样画". 给 "创作者" 仪式感.
   */
  storyPreview: {
    title: '故事就快好啦',
    subtitle: '看看熊熊把你的故事拼成什么样',
    confirm: '就这样,开始画!',
    confirmHint: '按遥控器 OK 键确认',
    fallbackParagraph: '熊熊把你说的话拼成了一个温暖的故事。',
  },

  generating: {
    title: '小熊正在给你画故事…',
    subtitle: '稍等半刻',
    hint: '画完大约需要几分钟, 可以先去故事乐园看看',
    progress: '已画完第 {ready} 页 / 共 {total} 页',
    elapsed: '已用 {seconds} 秒',
    almostDone: '马上画完啦~',
    exploreHint: '等待时可去探索其他故事',
    goLibrary: '故事乐园',
    stages: {
      thinking: '小熊在想故事呢...',
      firstPage: '正在画第一页...',
      morePages: '画其余 11 页...',
      // WO-3.18 Phase 1A: 原本是 '小熊在录音...' — 让用户以为熊熊在
      // 录音(实际是 TTS 合成阶段). 从孩子视角看, 整个生成阶段都是
      // "熊熊在画故事", 统一文案降低误解.
      recording: '小熊正在画你的故事...',
      almost: '快好了!',
    },
  },

  create: {
    title: '来讲故事',
    subtitle: '按 + 启动魔法,或选一本故事播放',
    newStory: '来讲一本',
    playFull: '看全集',
    sequel: '编续集',
  },
  story: {
    pageOf: '第 {current} 页 / 共 {total} 页',
    finished: '故事讲完啦,晚安',
    playAgain: '再听一次',
    backToLibrary: '回小书屋',
    ready: '故事画好啦!',
    startWatching: '按 OK 开始看',
    createdBy: '由 {name} 创作',
    endLearn: '进入识字',
    endSequel: '编个续集',
    ctrlPrev: '上一页',
    ctrlPlay: '播放',
    ctrlPause: '暂停',
    ctrlNext: '下一页',
    ctrlLearn: '识字',
    favorite: '收藏',
    unfavorite: '取消收藏',
    download: '下载',
    downloaded: '已下载',
  },

  favorites: {
    title: '我的收藏',
    count: '已收藏 {used} 本',
    empty: '还没有收藏哦,在喜欢的故事上点一下小红心吧',
    actions: {
      playFull: '看全集',
      sequel: '编续集',
      download: '下载',
      downloaded: '已下载',
      delete: '删除',
      removed: '已取消收藏',
      downloading: '下载中…',
      alreadyDownloaded: '本机已存',
      playHint: '演示模式 · 暂无内容',
      removeFailed: '取消收藏失败,请稍后重试',
    },
  },

  learning: {
    backToStory: '回故事',
    replay: '再听一次',
    switchLang: '切换语言',
  },

  library: {
    title: '故事乐园',
    empty: '故事乐园暂时空空的,稍后再来看看~',
    capacity: '共 {used} 本',
    favorited: '已收藏',
    catAll: '全部',
    catAdventure: '冒险',
    catFairy: '童话',
    catAnimals: '动物',
    catFriendship: '友谊',
    catBedtime: '睡前',
    catFavorites: '我的收藏',
    download: '下载到本地',
    delete: '删除',
    deleteConfirm: '真的删掉这本故事吗?',
  },

  /*
   * TV v1.0 §4.2: ProfileScreen 改名 "小熊小屋 / My Den".
   *   - 「我的脚印 🐾」全部替换为「我的星光 ⭐」
   *   - 「脚印」单位禁用,统一「星光」(stars)
   */

  profile: {
    title: '小熊小屋',
    subscriptionFree: '免费用户',
    subscriptionMonthly: '月度会员',
    subscriptionYearly: '年度会员',
    storiesRemaining: '剩余 {count} 本',
    starsLabel: '我的星光',
    starsValue: '⭐ {count}',
    metricLine: '⭐ {stars} 星光  ·  📖 {stories} 个故事',
    backToHome: '回到首页',
    /* TV v1.0 Profile redesign (2026-04-25): rich kids panel + family
       subscription badge + per-child stats + global bilingual settings. */
    subBadgeFree: '免费 · 剩 {count} 本',
    subBadgeMonthly: '⭐ 月度 · {days} 天后续费',
    subBadgeYearly: '👑 年度 · 剩 {days} 天',
    kidsTitle: '我的小孩',
    kidsAddSlot: '+ 家长 App 添加',
    kidsAddHint: '请在家长手机端添加小朋友',
    statStars: '⭐ {n}',
    statStoriesCreated: '📖 {n}',
    statLearnTime: '⏱  {time}',
    statWatchTime: '👁  {time}',
    statStoriesLabel: '故事',
    statLearnLabel: '学习',
    statWatchLabel: '观看',
    sectionGeneral: '通用设置',
    sectionAccount: '账户',
    sectionFamily: '家庭',
    familyIdLabel: '家庭编号',
    familyParentLabel: '家长',
    qrCaption: '扫码管理 / 充值',
    settings: {
      bgm: '背景音乐',
      learning: '识字模式',
      autoPlay: '自动翻页',
      language: '语言',
      displayLang: '界面语言',
      bilingual: '双语阅读',
    },
    bilingual: {
      off: '关闭',
      zhEn: '中 + EN',
      enZh: 'EN + 中',
      zhOnly: '只 中文',
      enOnly: '只 EN',
    },
  },

  /*
   * TV v1.0 §3.1: LeaderboardScreen 排行榜.
   *   3 Tab + 我家位置栏 + 空态.
   */
  leaderboard: {
    title: '小熊星光',
    titleEn: 'Bear Stars',
    topThree: 'TOP 3',
    tabWriters: '小作家榜',
    tabWeeklyHot: '本周热听',
    tabEditorPicks: '编辑精选',
    starsUnit: '星光',
    selfRank: '我家:#{rank}  ⭐ {stars}',
    selfRankBigOver: '我家:#999+  ⭐ {stars}',
    selfInTop10: '你家已经在 Top 10!继续保持 ⭐',
    viewMyGrowth: '查看我家成长',
    creatorPrefix: '{nickname} 创作',
    editorPickBadge: '精选',
    weeklyPlaysSuffix: '🔥 {count}',
    emptyTitle: '榜单准备中,先去讲个故事吧!',
    emptyCta: '立即创作',
  },

  /*
   * TV v1.0 §3.2: CreateInviteScreen 激励创作.
   */
  createInvite: {
    headline: '每讲一个故事 = ⭐ 10 星光',
    subBelow: '你家现在 ⭐ {stars} 星光,还差 ⭐ {gap} 上 Top 10!',
    subInTop10: '你家已经在 Top 10!继续保持 ⭐',
    ctaCreate: '立即开始创作',
    ctaLater: '稍后再说',
  },

  /*
   * TV v1.0 §3.3: FlashcardOverlay 暂停式词汇闪卡.
   */
  flashcard: {
    continueHint: '按 OK 键继续播放',
    nativeLabel: '中文',
    learningLabel: '英文',
    empty: '本页没有可学的词汇',
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
