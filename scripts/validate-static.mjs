import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const out = new URL("../out/", import.meta.url);
const routes = new Map([
  ["/", "index.html"],
  ["/codes/", "codes/index.html"],
]);

const read = (rel) => readFile(new URL(rel, out), "utf8");

export async function validateStaticSite() {
  for (const [route, file] of routes) {
    const html = await read(file);
    assert.match(html, /<link rel="canonical" href="https:\/\/upgraderupgradeyourskins\.wiki/);
    assert.match(html, /NewGame/);
    assert.match(html, /Upgrader/);
    assert.match(html, /1,500/);
    assert.match(html, /1,000/);
    assert.match(html, /2026-09-23/);
    if (route === "/codes/") {
      assert.match(html, /UPGRADER Roblox codes \(September 2026\)/);
      assert.match(html, /id="active-codes"/);
    }
    if (route === "/") {
      assert.match(html, /href="\/codes\/"/);
      assert.match(html, /UPGRADER Roblox codes \+ beginner upgrade route/);
    }
  }
  const sm = await read("sitemap.xml");
  assert.match(sm, /\/codes\//);
  console.log("static production validation passed");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await validateStaticSite();
}
