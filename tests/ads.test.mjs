import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { adsterraConfig } from "../adsterra/config.js";

const root = new URL("../", import.meta.url);
const read = (rel) => readFile(new URL(rel, root), "utf8");
const runtime = await read("adsterra/runtime.js");

const BANNED = [
  "abscloud.org",
  "highperformanceformat.com",
  "effectivecpmnetwork.com",
  "popunderScriptUrl",
  "socialBarScriptUrl",
  "adsterraSmartLinkUrl",
  "adsterraPopunderScriptUrl",
  "adsterraSocialBarScriptUrl"
];

function configFrom(html) {
  const match = html.match(/<script type="application\/json" id="adsterra-config">([\s\S]*?)<\/script>/);
  assert.ok(match, "missing adsterra-config");
  return JSON.parse(match[1]);
}

function runRuntime(config, path, width, placements = 3) {
  const scripts = [];
  const htmlBits = [];
  const hosts = new Map();
  const timers = [];
  const listeners = new WeakMap();
  function hostFor(id) {
    if (!hosts.has(id)) {
      const children = [];
      hosts.set(id, {
        id,
        children,
        appendChild(node) {
          children.push(node);
          if (node.src) scripts.push(node.src);
        },
        insertAdjacentHTML(_pos, html) { htmlBits.push(html); }
      });
    }
    return hosts.get(id);
  }
  const window = {
    location: { pathname: path },
    innerWidth: width,
    atOptions: null,
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    }
  };
  const document = {
    getElementById(id) {
      return id === "adsterra-config" ? { textContent: JSON.stringify(config) } : null;
    },
    querySelectorAll(selector) {
      return selector === "aside.ad-placement" ? Array.from({ length: placements }) : [];
    },
    querySelector(selector) {
      const match = String(selector).match(/data-ad-host="([^"]+)"/);
      return match ? hostFor(match[1]) : null;
    },
    createElement() {
      const node = {
        src: "",
        async: false,
        text: "",
        setAttribute(name, value) { this[name] = value; },
        addEventListener(type, fn) {
          const bag = listeners.get(node) || {};
          bag[type] = fn;
          listeners.set(node, bag);
        }
      };
      return node;
    },
    write() { throw new Error("document.write must be shimmed before creatives run"); },
    writeln() { throw new Error("document.writeln must be shimmed before creatives run"); }
  };
  vm.runInContext(runtime, vm.createContext({ window, document, Promise }));
  return {
    scripts,
    htmlBits,
    hosts,
    window,
    document,
    async settle() {
      for (let step = 0; step < 8; step += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        for (const host of hosts.values()) {
          for (const node of host.children) {
            const bag = listeners.get(node);
            if (bag && bag.load && !node._loaded) {
              node._loaded = true;
              bag.load();
            }
          }
        }
        const pending = timers.splice(0);
        for (const timer of pending) timer.callback();
      }
    }
  };
}

test("handoff config keeps Banner and Native and leaves Popunder and Social Bar off", () => {
  assert.equal(adsterraConfig.adsterraEnablePopunder, false);
  assert.equal(adsterraConfig.adsterraEnableSocialBar, false);
  assert.equal(adsterraConfig.adsterraEnableStickyRail, false);
  assert.equal(adsterraConfig.adsterraNative1ScriptUrl, "https://bauval.org/21/fc8db45ee114d8e9694866814c786e11");
  for (const [key, id] of [
    ["adsterraBanner728x90ScriptUrl", "084da77dd9442a56fab3447033990f97"],
    ["adsterraBanner320x50ScriptUrl", "72d16040e198150fbd951f9913698a9c"],
    ["adsterraBanner300x250ScriptUrl", "a0b89d795e91bc9545f500a492ccbe27"],
    ["adsterraBanner468x60ScriptUrl", "abeb1f1b5e67155fbb6f195fbba5fc6a"],
    ["adsterraBanner160x600ScriptUrl", "0eb427100dcc1fbf7903802bb737f56d"],
    ["adsterraBanner160x300ScriptUrl", "edb477f9841728cc409c9f8ecc824054"]
  ]) {
    assert.equal(adsterraConfig[key], `https://bauval.org/22/${id}`);
  }
  const blob = JSON.stringify(adsterraConfig);
  for (const banned of BANNED) assert.equal(blob.includes(banned), false, banned);
});

test("runtime is a classic script and does not reference disabled formats", () => {
  assert.doesNotMatch(runtime, /\bimport\b/);
  assert.doesNotMatch(runtime, /\bexport\b/);
  for (const banned of BANNED) assert.equal(runtime.includes(banned), false, banned);
});

test("content pages place at most three Banner and Native slots after the first content block", async () => {
  for (const [rel, marker] of [["index.html", 'id="codes-preview"'], ["codes/index.html", 'id="active-codes"']]) {
    const html = await read(rel);
    const config = configFrom(html);
    assert.equal(config.enablePopunder, false);
    assert.equal(config.enableSocialBar, false);
    assert.equal(config.slots.length, 3);
    assert.equal(html.split('class="ad-placement"').length - 1, 3);
    assert.ok(html.indexOf(marker) < html.indexOf('class="ad-placement"'));
    assert.equal(html.split('src="/adsterra/runtime.js?v=20261016-banner-native"').length - 1, 1);
    assert.equal(html.includes("abscloud.org"), false);
    assert.equal(html.includes("highperformanceformat.com"), false);
    assert.match(html, /https:\/\/bauval\.org\/21\/fc8db45ee114d8e9694866814c786e11/);
    assert.match(html, /https:\/\/bauval\.org\/22\/084da77dd9442a56fab3447033990f97/);
    assert.match(html, /https:\/\/bauval\.org\/22\/a0b89d795e91bc9545f500a492ccbe27/);
  }
});

test("legal and utility pages do not ship ad slots or the runtime", async () => {
  for (const rel of ["sources/index.html", "404.html"]) {
    const html = await read(rel);
    assert.equal(html.includes("adsterra"), false, rel);
    assert.equal(html.includes("ad-placement"), false, rel);
    assert.equal(html.includes("bauval.org"), false, rel);
  }
});

test("desktop content page requests the wide banner, native, and rectangle invoke scripts", async () => {
  const html = await read("index.html");
  const config = configFrom(html);
  config.enablePopunder = true;
  config.popunderScriptUrl = "https://abscloud.org/1/should-not-load";
  config.enableSocialBar = true;
  config.socialBarScriptUrl = "https://bauval.org/social.js";
  const page = runRuntime(config, "/", 1280);
  await page.settle();
  assert.deepEqual(page.scripts, [
    "https://bauval.org/22/084da77dd9442a56fab3447033990f97",
    "https://bauval.org/21/fc8db45ee114d8e9694866814c786e11",
    "https://bauval.org/22/a0b89d795e91bc9545f500a492ccbe27"
  ]);
  assert.equal(page.hosts.get("native").children.some((node) => node.id === "container-fc8db45ee114d8e9694866814c786e11"), true);
  assert.equal(page.window.atOptions.key, "a0b89d795e91bc9545f500a492ccbe27");
  assert.equal(page.window.atOptions.width, 300);
  assert.equal(page.window.atOptions.height, 250);
});

test("narrow and tablet screens pick the banner invoke script that fits", async () => {
  const home = configFrom(await read("index.html"));
  const narrow = runRuntime(home, "/codes/", 360);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(narrow.scripts[0], "https://bauval.org/22/72d16040e198150fbd951f9913698a9c");
  assert.equal(narrow.window.atOptions.width, 320);
  assert.equal(narrow.window.atOptions.height, 50);

  const codes = configFrom(await read("codes/index.html"));
  const tablet = runRuntime(codes, "/codes/index.html", 500);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(tablet.scripts[0], "https://bauval.org/22/abeb1f1b5e67155fbb6f195fbba5fc6a");
  assert.equal(tablet.window.atOptions.width, 468);
  assert.equal(tablet.window.atOptions.height, 60);
});

test("legal paths, clean pages, and more than three placements make no requests", async () => {
  const config = configFrom(await read("index.html"));
  for (const path of ["/sources/", "/privacy", "/terms", "/contact", "/about", "/disclosure", "/404.html"]) {
    const page = runRuntime(config, path, 1280);
    await page.settle();
    assert.deepEqual(page.scripts, [], path);
  }
  const clean = runRuntime({ ...config, cleanPage: true }, "/", 1280);
  await clean.settle();
  assert.deepEqual(clean.scripts, []);
  const crowded = runRuntime(config, "/", 1280, 4);
  await crowded.settle();
  assert.deepEqual(crowded.scripts, []);
});

test("document.write from a banner script still requests a follow-up invoke script", async () => {
  const config = configFrom(await read("index.html"));
  config.slots = [config.slots[0]];
  const page = runRuntime(config, "/", 1280, 1);
  await new Promise((resolve) => setImmediate(resolve));
  page.document.write('<script src="https://bauval.org/follow/invoke.js"></script><iframe src="https://bauval.org/creative"></iframe>');
  assert.equal(page.scripts.includes("https://bauval.org/follow/invoke.js"), true);
  assert.equal(page.htmlBits.some((html) => html.includes("https://bauval.org/creative")), true);
});
