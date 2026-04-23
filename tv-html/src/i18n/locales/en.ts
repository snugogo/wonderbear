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
    subtitle: 'Discover new stories with the bear',
    scanHint: 'Scan to let the bear meet you',
    waitingHint: 'Once your grown-up scans, the bear will know you',
    fallbackUrl: "Can't scan? Open in browser",
    activationCodeLabel: 'Activation code',
    waitingForBinding: 'Waiting for binding…',
    bindingDone: 'The bear knows you now!',
  },

  home: {
    greeting: 'Hi, {name}!',
    greetingDefault: 'Hi there!',
    coins: 'Coins',
    switchChild: 'Switch child',
    menus: {
      create: 'Create',
      stories: 'Stories',
      library: 'My Library',
      explore: 'Explore',
      profile: 'My Home',
      cast: 'Cast',
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
  },

  generating: {
    title: 'Bear is painting your story…',
    progress: 'Page {ready} of {total} done',
    elapsed: '{seconds}s elapsed',
    almostDone: 'Almost done!',
  },

  story: {
    pageOf: 'Page {current} of {total}',
    finished: 'The end. Goodnight.',
    playAgain: 'Play again',
    backToLibrary: 'Back to library',
  },

  library: {
    title: 'My Library',
    empty: "Your library is empty — let's create one!",
    capacity: '{used}/{max} on device',
    favorited: 'Favorited',
    download: 'Download',
    delete: 'Delete',
    deleteConfirm: 'Really delete this story?',
  },

  profile: {
    title: 'My Home',
    subscriptionFree: 'Free user',
    subscriptionMonthly: 'Monthly member',
    subscriptionYearly: 'Yearly member',
    storiesRemaining: '{count} stories left',
    settings: {
      bgm: 'Background music',
      learning: 'Reading mode',
      autoPlay: 'Auto-advance',
      language: 'Language',
    },
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

  hint: {
    crossRow: 'Switch row',
    sameRow: 'Same row',
    confirm: 'Select',
    back: 'Back',
    voiceKey: 'Hold to talk',
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
