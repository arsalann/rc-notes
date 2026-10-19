/**
 * Gives this browser a lasting random id and sends it as `X-Daybook-Device` on every API call, so
 * the server records which device made each change (`updated_device_id`, `event_log.device_id`),
 * the same way the iOS app does.
 */
export default defineNuxtPlugin(() => {
  const key = 'daybook:device-id';
  let id: string | null = null;
  try {
    id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
  } catch {
    // Private mode or storage blocked: writes simply carry no device id.
    return;
  }
  globalThis.$fetch = $fetch.create({ headers: { 'X-Daybook-Device': id } }) as typeof $fetch;
});
