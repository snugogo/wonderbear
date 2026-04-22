import { http } from './http';
import type { Child, Device, DeviceStatus, DeviceSummary } from '@/types';

/**
 * 设备模块 - H5 相关(API_CONTRACT v1.0 §五)
 * TV 端专属的 register/heartbeat/ack-command H5 用不到
 */
export const deviceApi = {
  /** 5.3 家长绑定设备 */
  bind(params: { deviceId: string; activationCode: string; forceOverride?: boolean }) {
    return http.post<{ device: Device; activatedQuota: boolean }>('/api/device/bind', params);
  },

  /**
   * 5.4 家长解绑设备(= 转让)
   * 需要二次确认:密码或 6 位邮件验证码
   */
  unbind(params: { deviceId: string; confirmCode: string }) {
    return http.post<{ deviceId: string; status: DeviceStatus }>('/api/device/unbind', params);
  },

  /** 5.7 获取当前活跃孩子 + 所有孩子(切换弹窗用) */
  getActiveChild() {
    return http.get<{ activeChild: Child | null; allChildren: Child[] }>(
      '/api/device/active-child'
    );
  },

  /** 5.8 切换当前活跃孩子 */
  setActiveChild(params: { deviceId: string; childId: string }) {
    return http.post<{ activeChild: Child }>('/api/device/active-child', params);
  },

  /**
   * 5.9 远程重启设备
   * 命令入队,TV 下次 heartbeat 时执行,所以有 willExecuteWithin 延迟
   */
  reboot(id: string) {
    return http.post<{ commandId: string; queuedAt: string; willExecuteWithin: number }>(
      `/api/device/${id}/reboot`
    );
  },

  /** 5.10 我的设备列表 */
  list() {
    return http.get<{ items: DeviceSummary[] }>('/api/device/list');
  },
};
