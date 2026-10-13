import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const runtime = await readFile(new URL("../adsterra/runtime.js", import.meta.url), "utf8");
function storage(values = new Map()) {
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function visitor() {
  let time = 1791849600000;
  let pending = Promise.resolve();
  const local = storage();
  const session = storage();
  const locks = { request: (_name, callback) => {
    const result = pending.then(callback);
    pending = result.then(() => undefined, () => undefined);
    return result;
  } };
  return { local, session, locks, now: () => time, advance: ms => { time += ms; } };
}
function page(v, path, overrides = {}) {
  const nodes = new Map();
  const loaded = [];
  const timers = [];
  const config = { adNetwork: "adsterra", status: "ready", slots: [], enablePopunder: true, popunderScriptUrl: "https://example.invalid/pop.js", popunderMinPageViews: 2, popunderDelayMs: 30000, ...overrides.config };
  nodes.set("adsterra-config", { textContent: JSON.stringify(config) });
  const window = {
    location: { pathname: path }, innerWidth: 1024,
    localStorage: overrides.local ?? v.local, sessionStorage: v.session,
    navigator: { locks: "locks" in overrides ? overrides.locks : v.locks },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); }
  };
  const document = {
    getElementById: id => nodes.get(id) ?? null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: tag => ({ tag, setAttribute(name, value) { this[name] = value; } }),
    body: { appendChild(node) { nodes.set(node.id, node); loaded.push(node); } }
  };
  const context = vm.createContext({ window, document, Date: { now: v.now } });
  function run() { vm.runInContext(runtime, context); }
  run();
  return { loaded, timers, window, run, flush: async () => {
    for (const timer of timers.splice(0)) timer.callback();
    await new Promise(resolve => setImmediate(resolve));
  } };
}

test("requires two page views and 30 seconds; duplicate runtime execution does not count twice", async () => {
  const v = visitor(), first = page(v, "/");
  first.run();
  assert.equal(first.timers.length, 0);
  const second = page(v, "/codes/");
  assert.equal(second.timers[0].delay, 30000);
  assert.equal(second.loaded.length, 0);
  await second.flush();
  assert.equal(second.loaded.length, 1);
  assert.equal(second.loaded[0]["data-cfasync"], "false");
});

test("tabs/refreshes share the 24h cap, including the exact cooldown boundary", async () => {
  const v = visitor(); page(v, "/");
  const a = page(v, "/codes/"), b = page(v, "/codes/");
  await Promise.all([a.flush(), b.flush()]);
  assert.equal(a.loaded.length + b.loaded.length, 1);
  v.advance(86399999);
  const refresh = page(v, "/"); await refresh.flush();
  assert.equal(refresh.loaded.length, 0);
  v.advance(1);
  const nextDay = page(v, "/"); await nextDay.flush();
  assert.equal(nextDay.loaded.length, 1);
});

test("legal/trust/404/unknown pages and disabled settings do not start Pop", async () => {
  for (const route of ["/sources/", "/privacy", "/terms", "/about", "/404.html", "/no-such-page"]) {
    const p = page(visitor(), route); await p.flush(); assert.equal(p.loaded.length, 0);
  }
  const v = visitor(); page(v, "/");
  const p = page(v, "/codes/", { config: { enablePopunder: false } }); await p.flush(); assert.equal(p.loaded.length, 0);
});

test("storage failures, missing locks, corrupt timestamps and route changes stay closed", async () => {
  const bad = { getItem() { throw Error("disabled"); }, setItem() { throw Error("disabled"); } };
  for (const overrides of [{ local: bad }, { locks: undefined }]) {
    const v = visitor(); page(v, "/"); const p = page(v, "/codes/", overrides); await p.flush(); assert.equal(p.loaded.length, 0);
  }
  for (const value of ["", "invalid", "Infinity", "0"]) {
    const v = visitor(); v.local.setItem("upgrader-adsterra-popunder-last-start", value); page(v, "/");
    const p = page(v, "/codes/"); await p.flush(); assert.equal(p.loaded.length, 0);
  }
  const v = visitor(); page(v, "/"); const p = page(v, "/codes/"); p.window.location.pathname = "/sources/";
  await p.flush(); assert.equal(p.loaded.length, 0);
});
