import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const runtime = await readFile(new URL("../adsterra/runtime.js", import.meta.url), "utf8");
function storage(values = new Map()) {
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function visitor() {
  const session = storage();
  return { session };
}
function page(v, path, overrides = {}) {
  const nodes = new Map();
  const loaded = [];
  const timers = [];
  const config = { adNetwork: "adsterra", status: "ready", slots: [], enablePopunder: true, popunderScriptUrl: "https://example.invalid/pop.js", popunderMinPageViews: 2, popunderDelayMs: 30000, ...overrides.config };
  nodes.set("adsterra-config", { textContent: JSON.stringify(config) });
  const window = {
    location: { pathname: path }, innerWidth: 1024,
    sessionStorage: overrides.session ?? v.session,
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); }
  };
  const document = {
    getElementById: id => nodes.get(id) ?? null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: tag => ({ tag, setAttribute(name, value) { this[name] = value; } }),
    body: { appendChild(node) { nodes.set(node.id, node); loaded.push(node); } }
  };
  Object.defineProperty(window, "localStorage", { get() { throw Error("Removed daily cap must not access localStorage"); } });
  const context = vm.createContext({ window, document });
  function run() { vm.runInContext(runtime, context); }
  run();
  return { loaded, timers, window, run, flush: async () => {
    for (const timer of timers.splice(0)) timer.callback();
    await new Promise(resolve => setImmediate(resolve));
  } };
}

test("first content page starts immediately, without timers, once per document", () => {
  const v = visitor(), first = page(v, "/");
  first.run();
  assert.equal(first.timers.length, 0);
  assert.equal(first.loaded.length, 1);
  const second = page(v, "/codes/");
  assert.equal(second.timers.length, 0);
  assert.equal(second.loaded.length, 1);
  assert.equal(second.loaded[0]["data-cfasync"], "false");
});

test("refreshes and tabs can load again under provider default frequency, once per document", async () => {
  const v = visitor(); page(v, "/");
  const a = page(v, "/codes/"), b = page(v, "/codes/");
  await Promise.all([a.flush(), b.flush()]);
  assert.equal(a.loaded.length + b.loaded.length, 2);
  a.run(); await a.flush();
  assert.equal(a.loaded.length, 1);
  const refresh = page(v, "/"); await refresh.flush();
  assert.equal(refresh.loaded.length, 1);
});

test("legal/trust/404/unknown pages and disabled settings do not start Pop", async () => {
  for (const route of ["/sources/", "/privacy", "/terms", "/about", "/404.html", "/no-such-page"]) {
    const p = page(visitor(), route); await p.flush(); assert.equal(p.loaded.length, 0);
  }
  const v = visitor(); page(v, "/");
  const p = page(v, "/codes/", { config: { enablePopunder: false } }); await p.flush(); assert.equal(p.loaded.length, 0);
});

test("storage and old pageview records are no longer needed to load Pop", () => {
  const bad = { getItem() { throw Error("disabled"); }, setItem() { throw Error("disabled"); } };
  const blocked = page(visitor(), "/codes/", { session: bad }); assert.equal(blocked.loaded.length, 1);
  for (const value of ["invalid", "Infinity", "-1"]) {
    const v = visitor(); v.session.setItem("upgrader-adsterra-pageviews", value);
    const p = page(v, "/codes/"); assert.equal(p.loaded.length, 1);
  }
});
