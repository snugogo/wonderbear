import { ref, onUnmounted } from 'vue';

/**
 * 验证码倒计时
 * start(sec) 启动;remaining 实时剩余秒数;canSend 是否可再次发送
 */
export function useCountdown(defaultSec = 60) {
  const remaining = ref(0);
  const canSend = ref(true);
  let timer: ReturnType<typeof setInterval> | null = null;

  function clear() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start(sec = defaultSec) {
    clear();
    remaining.value = sec;
    canSend.value = false;
    timer = setInterval(() => {
      remaining.value -= 1;
      if (remaining.value <= 0) {
        canSend.value = true;
        clear();
      }
    }, 1000);
  }

  onUnmounted(clear);

  return { remaining, canSend, start, clear };
}
