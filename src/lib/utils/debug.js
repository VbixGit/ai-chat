let ENABLE_DEBUG = true;

export function setDebug(enabled = false) {
  ENABLE_DEBUG = !!enabled;
}

export function debug(...args) {
  if (!ENABLE_DEBUG) return;
  try {
    console.log("[DEBUG]", ...args);
  } catch (e) {
    // swallow
  }
}

export function debugJson(label, obj) {
  if (!ENABLE_DEBUG) return;
  try {
    console.log("[DEBUG]", label, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.log("[DEBUG]", label, obj);
  }
}

export default { setDebug, debug, debugJson };
