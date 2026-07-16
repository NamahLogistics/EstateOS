/** Stable browser id for unusual-device login checks. */
const DEVICE_KEY = 'heirready_device_id';

export function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (id && id.length >= 16) return id;
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `d_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return `d_ephemeral_${Date.now()}`;
  }
}
