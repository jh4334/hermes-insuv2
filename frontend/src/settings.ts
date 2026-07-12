/**
 * 로컬 앱 설정 (localStorage). offline-first 원칙에 따라 외부 네트워크를 쓰는
 * 기능은 모두 기본 꺼짐이며 사용자가 명시적으로 켠다.
 */

export const ONLINE_HOLIDAYS_KEY = 'handover:online-holidays:v1';

export function readOnlineHolidaysEnabled(): boolean {
  try {
    return localStorage.getItem(ONLINE_HOLIDAYS_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeOnlineHolidaysEnabled(enabled: boolean): void {
  localStorage.setItem(ONLINE_HOLIDAYS_KEY, enabled ? 'on' : 'off');
}
