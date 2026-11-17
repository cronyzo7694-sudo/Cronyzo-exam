/**
 * testFileBridge — makes someone else's HTML test file behave like part of
 * Cronyzo, without touching a single line of it.
 *
 * When a student opens their own file we do not just dump it in an iframe:
 * a tiny script is injected at the very top of the document, before the file's
 * own code runs. That script
 *
 *   1. gives the file a working `localStorage` / `sessionStorage`, even inside
 *      a sandboxed frame where the real one is blocked, and mirrors every write
 *      back to the host app (so `localStorage`-saving tests keep working);
 *   2. watches inputs, textareas, selects and scroll position and reports them
 *      to the host every few seconds and on hide/unload;
 *   3. replays the last saved answers + scroll position on the next load.
 *
 * Everything is one-way-safe: the file never gets access to the host's storage,
 * cookies or tokens.
 */

export type BridgeState = {
  values?: Record<string, string>;
  scroll?: number;
  storage?: Record<string, string>;
};

const BRIDGE = String.raw`(function () {
  var STATE = __CZ_STATE__;
  var store = {};
  try { store = Object.assign({}, (STATE && STATE.storage) || {}); } catch (e) { store = {}; }

  function post(kind, data) {
    try { parent.postMessage({ cz: kind, data: data }, "*"); } catch (e) {}
  }

  /* ---- 1. a localStorage the sandbox cannot refuse ---------------------- */
  var memoryStorage = {
    getItem: function (key) {
      key = String(key);
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem: function (key, value) {
      store[String(key)] = String(value);
      post("storage", store);
    },
    removeItem: function (key) {
      delete store[String(key)];
      post("storage", store);
    },
    clear: function () {
      store = {};
      post("storage", store);
    },
    key: function (index) {
      var keys = Object.keys(store);
      return index >= 0 && index < keys.length ? keys[index] : null;
    }
  };
  try {
    Object.defineProperty(memoryStorage, "length", {
      get: function () { return Object.keys(store).length; }
    });
  } catch (e) {}
  try { Object.defineProperty(window, "localStorage", { configurable: true, get: function () { return memoryStorage; } }); } catch (e) {}
  try { Object.defineProperty(window, "sessionStorage", { configurable: true, get: function () { return memoryStorage; } }); } catch (e) {}

  /* ---- 2. what the student answered ------------------------------------ */
  function fields() {
    return document.querySelectorAll("input,textarea,select");
  }
  function keyOf(el, index) {
    if (el.id) return "id:" + el.id;
    if (el.name) return "name:" + el.name;
    return "idx:" + index;
  }
  function collect() {
    var values = {};
    var els = fields();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var type = (el.type || "").toLowerCase();
      if (type === "file" || type === "password") continue;
      if (type === "checkbox" || type === "radio") values[keyOf(el, i)] = el.checked ? "1" : "0";
      else values[keyOf(el, i)] = el.value;
    }
    return {
      values: values,
      scroll: window.pageYOffset || document.documentElement.scrollTop || 0,
      at: Date.now()
    };
  }
  function apply(state) {
    if (!state || !state.values) return;
    var els = fields();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var type = (el.type || "").toLowerCase();
      if (type === "file" || type === "password") continue;
      var saved = state.values[keyOf(el, i)];
      if (saved === undefined) continue;
      if (type === "checkbox" || type === "radio") {
        var want = saved === "1";
        if (el.checked !== want) el.checked = want;
      } else if (el.value !== saved) {
        el.value = saved;
      }
      try {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (e) {}
    }
    if (state.scroll) {
      setTimeout(function () { try { window.scrollTo(0, state.scroll); } catch (e) {} }, 80);
    }
  }

  var timer = null;
  function pushSoon(delay) {
    clearTimeout(timer);
    timer = setTimeout(function () { post("snapshot", collect()); }, delay || 900);
  }

  document.addEventListener("input", function () { pushSoon(900); }, true);
  document.addEventListener("change", function () { pushSoon(900); }, true);
  document.addEventListener("click", function () { pushSoon(1500); }, true);
  window.addEventListener("scroll", function () { pushSoon(1400); }, true);
  window.addEventListener("pagehide", function () { post("snapshot", collect()); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") post("snapshot", collect());
  });
  setInterval(function () { post("snapshot", collect()); }, 6000);

  /* ---- 3. restore, then tell the host we are alive ---------------------- */
  function boot() {
    apply(STATE);
    setTimeout(function () { post("snapshot", collect()); }, 400);
    post("ready");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("load", function () { apply(STATE); });
})();`;

function escapeForScript(json: string): string {
  // `</script>` inside the JSON would end the injected block early.
  return json.replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, " ");
}

function inject(html: string, state: BridgeState): string {
  const payload = escapeForScript(JSON.stringify(state ?? {}));
  const script = `<script>${BRIDGE.replace("__CZ_STATE__", payload)}</script>`;

  // Earliest possible point: right after <head>, so the file's own scripts
  // (which may read localStorage on the first line) see our shim.
  const headOpen = html.match(/<head[^>]*>/i);
  if (headOpen && headOpen.index !== undefined) {
    const at = headOpen.index + headOpen[0].length;
    return html.slice(0, at) + script + html.slice(at);
  }
  const doctype = html.match(/<!doctype[^>]*>/i);
  if (doctype && doctype.index !== undefined) {
    const at = doctype.index + doctype[0].length;
    return html.slice(0, at) + script + html.slice(at);
  }
  return script + html;
}

/** The exact HTML handed to the iframe (file + bridge + saved state). */
export function buildSrcDoc(html: string, state: BridgeState = {}): string {
  return inject(html, state);
}
