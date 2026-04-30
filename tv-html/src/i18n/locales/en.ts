// English locale — first-pass translation. Mark items needing native polish with [TODO_en].
export default {
  common: {
    ok: 'OK',
    back: 'Back',
    cancel: 'Cancel',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',
    loading: 'Loading…',
    retry: 'Try again',
    settings: 'Settings',
  },

  boot: {
    welcome: 'WonderBear',
    initializing: 'Bear is getting ready…',
  },

  activation: {
    title: 'Welcome to WonderBear',
    subtitle: 'Discover Story Book\nWith WonderBear',
    scanHint: 'Scan to let the bear meet you',
    waitingHint: 'Once your grown-up scans, the bear will know you',
    fallbackUrl: "Can't scan? Open in browser",
    activationCodeLabel: 'Activation code',
    waitingForBinding: 'Waiting for binding…',
    bindingDone: 'The bear knows you now!',
  },

  /*
   * TV v1.0 §2.1 — locked 6-entry naming. EN labels accompany ZH-primary.
   */
  home: {
    greeting: 'Hi, {name}!',
    greetingDefault: 'Hi there!',
    coins: 'Coins',
    switchChild: 'Switch child',
    stars: 'Stars',
    menus: {
      create: 'Create',
      stories: 'Stories',
      bearStars: 'Bear Stars',
      cast: 'Cast',
      myDen: 'My Den',
      settings: 'Settings',
      // Compat aliases (still mapped to new copy).
      library: 'Stories',
      explore: 'Settings',
      profile: 'My Den',
    },
    menuComingSoon: 'Coming soon',
  },

  dialogue: {
    progress: 'Question {current} of {total}',
    pressVoiceKey: 'Press the microphone key to tell me',
    listening: 'Bear is listening…',
    thinking: 'Bear is thinking…',
    speaking: 'Bear is speaking…',
    earlyEndHint: 'Press OK if you want the bear to start painting now',
    didNotHear: "I didn't hear you, please try again",
    willPaintNow: "Let's turn this into a story now, more next time!",
    starting: "Bear's ready, here we go!",
    holdMicHint: 'Hold the mic key to talk, release when done',
    readyPainter: 'Ready for painting',
    /* v7.2: turn summary ribbon — short "You said: …" line. */
    youSaid: 'You said:',
    retry: 'Redo',
    send: 'Send',
    confirm: 'Confirm',
    magic: 'Magic',
    micLocked: 'Got it, sweetie!',
    /* WO-3.6: on-screen mic button (tablets / PC browsers trigger voice-key-down via UI). */
    micButton: {
      idle: 'Hold to talk',
      recording: 'Listening...',
      aria: 'Hold to record voice',
    },
    demoQuestion: 'What kind of story do you want to hear today?',
    demoReply: 'I want a story about a brave little bear adventuring in the forest!',
  },

  /*
   * v7.2 §1.4 — StoryPreviewScreen
   * Outline preview shown after dialogue done=true, before generating.
   * Gives the child a "this is your story" moment of authorship.
   */
  storyPreview: {
    title: 'Your story is taking shape',
    subtitle: 'Here is how Bear pieced it together',
    confirm: 'Make this story real',
    confirmHint: 'Press OK on the remote to confirm',
    fallbackParagraph: 'Bear is shaping your story into something cozy.',
  },

  generating: {
    title: 'Bear is painting your story…',
    subtitle: 'One moment please',
    hint: 'This takes a few minutes — visit Stories while you wait',
    progress: 'Page {ready} of {total} done',
    elapsed: '{seconds}s elapsed',
    almostDone: 'Almost done!',
    exploreHint: 'Feel free to explore other stories while you wait',
    goLibrary: 'Stories',
    stages: {
      thinking: 'The bear is thinking up a story...',
      firstPage: 'Painting the first page...',
      morePages: 'Painting the rest of the pages...',
      recording: 'The bear is recording...',
      almost: 'Almost ready!',
    },
  },

  create: {
    title: 'Create',
    subtitle: 'Press + to Start Magic, or pick a story to play',
    newStory: 'Start Magic',
    playFull: 'Play Full',
    sequel: 'Create Sequel',
  },
  story: {
    pageOf: 'Page {current} of {total}',
    finished: 'The end. Goodnight.',
    playAgain: 'Play again',
    backToLibrary: 'Back to library',
    ready: 'Your story is ready!',
    startWatching: 'Press OK to start',
    endLearn: 'Enter Learn',
    endSequel: 'Create Sequel',
    ctrlPrev: 'Previous',
    ctrlPlay: 'Play',
    ctrlPause: 'Pause',
    ctrlNext: 'Next',
    ctrlLearn: 'Learn',
    favorite: 'Favorite',
    unfavorite: 'Unfavorite',
    download: 'Download',
    downloaded: 'Downloaded',
  },

  favorites: {
    title: 'My Favorites',
    count: '{used} favorited',
    empty: 'No favorites yet — tap the heart on a story you love',
    actions: {
      playFull: 'Play Full',
      sequel: 'Create Sequel',
      download: 'Download',
      downloaded: 'Saved',
      delete: 'Delete',
      removed: 'Removed from favorites',
      downloading: 'Downloading…',
      alreadyDownloaded: 'Already on this device',
      playHint: 'Demo only — story not loaded',
      removeFailed: 'Could not unfavorite — try again later',
    },
  },

  learning: {
    backToStory: 'Back to story',
    replay: 'Play again',
    switchLang: 'Switch language',
  },

  library: {
    title: 'Stories',
    empty: 'Stories is empty — check back soon!',
    capacity: '{used} stories',
    favorited: 'Favorited',
    download: 'Download',
    delete: 'Delete',
    deleteConfirm: 'Really delete this story?',
    catAll: 'All',
    catAdventure: 'Adventure',
    catFairy: 'Fairy Tale',
    catAnimals: 'Animals',
    catFriendship: 'Friendship',
    catBedtime: 'Bedtime',
    catFavorites: 'Favorites',
  },

  profile: {
    title: 'My Den',
    subscriptionFree: 'Free user',
    subscriptionMonthly: 'Monthly member',
    subscriptionYearly: 'Yearly member',
    storiesRemaining: '{count} stories left',
    starsLabel: 'My Stars',
    starsValue: '⭐ {count}',
    metricLine: '⭐ {stars} stars  ·  📖 {stories} stories',
    backToHome: 'Back to Home',
    /* TV v1.0 Profile redesign (2026-04-25): rich kids panel + family
       subscription badge + per-child stats + global bilingual settings. */
    subBadgeFree: 'Free  ·  {count} stories left',
    subBadgeMonthly: '⭐ Monthly  ·  renews in {days}d',
    subBadgeYearly: '👑 Yearly  ·  {days} days left',
    kidsTitle: 'Kids',
    kidsAddSlot: '+ Add via parent app',
    kidsAddHint: 'Open parent app to add a child',
    statStars: '⭐ {n}',
    statStoriesCreated: '📖 {n}',
    statLearnTime: '⏱  {time}',
    statWatchTime: '👁  {time}',
    statStoriesLabel: 'stories',
    statLearnLabel: 'learning',
    statWatchLabel: 'watching',
    sectionGeneral: 'General settings',
    sectionAccount: 'Account',
    sectionFamily: 'Family',
    familyIdLabel: 'Family ID',
    familyParentLabel: 'Parent',
    qrCaption: 'Scan to manage / upgrade',
    settings: {
      bgm: 'Background music',
      learning: 'Reading mode',
      autoPlay: 'Auto-advance',
      language: 'Language',
      displayLang: 'Display language',
      bilingual: 'Bilingual reading',
    },
    bilingual: {
      off: 'Off',
      zhEn: '中 + EN',
      enZh: 'EN + 中',
      zhOnly: '中 only',
      enOnly: 'EN only',
    },
  },

  leaderboard: {
    title: 'Bear Stars',
    titleEn: 'Bear Stars',
    topThree: 'Top 3',
    tabWriters: 'Writers',
    tabWeeklyHot: 'Weekly Hot',
    tabEditorPicks: 'Editor Picks',
    starsUnit: 'stars',
    selfRank: 'My family: #{rank}  {stars} stars',
    selfRankBigOver: 'My family: #999+  {stars} stars',
    selfInTop10: 'Your family is in the Top 10. Keep it up.',
    viewMyGrowth: 'View my family',
    creatorPrefix: 'by {nickname}',
    editorPickBadge: 'Pick',
    weeklyPlaysSuffix: '{count} plays',
    emptyTitle: 'Board warming up — go tell a story first!',
    emptyCta: 'Create now',
  },

  createInvite: {
    headline: 'Each story = ⭐ 10 stars',
    subBelow: 'You have ⭐ {stars} stars — ⭐ {gap} more to reach Top 10!',
    subInTop10: 'You are in the Top 10! Keep going ⭐',
    ctaCreate: 'Start creating now',
    ctaLater: 'Maybe later',
  },

  flashcard: {
    continueHint: 'Press OK to keep playing',
    nativeLabel: 'Chinese',
    learningLabel: 'English',
    empty: 'No vocabulary on this page',
  },

  offline: {
    title: 'No connection',
    subtitle: 'Check your WiFi?',
    available: 'Downloaded stories still work',
    retry: 'Reconnect',
  },

  error: {
    title: 'Bear ran into a small problem',
    retry: 'Try again',
    backHome: 'Home',
  },

  dev: {
    panelTitle: 'Dev Panel',
    simulateVoiceDown: 'Voice key down',
    simulateVoiceUp: 'Voice key up',
    simulateOffline: 'Go offline',
    simulateOnline: 'Go online',
    simulateActivated: 'Mark activated',
    jumpScreen: 'Jump screen',
    showFocus: 'Current focus',
    showMemory: 'Memory',
    triggerError: 'Trigger error',
  },
};
