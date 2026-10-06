import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// GitHub Pages publishes main:/ (repo root), so validate the published files directly.
const out = new URL("../", import.meta.url);
const routes = new Map([
  ["/", "index.html"],
  ["/codes/", "codes/index.html"],
]);

const read = (rel) => readFile(new URL(rel, out), "utf8");

// Every JSON-LD block must be strict JSON (no single quotes) with correctly typed values.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2}))?$/;
export function validateJsonLd(route, html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 1, `${route}: missing JSON-LD`);
  for (const raw of blocks) {
    const data = JSON.parse(raw);
    assert.equal(data["@context"], "https://schema.org");
    const nodes = Array.isArray(data["@graph"]) ? data["@graph"] : [data];
    for (const node of nodes) {
      assert.equal(typeof node["@type"], "string", `${route}: @type must be a string`);
      for (const key of ["name", "url", "description"]) {
        if (key in node) assert.equal(typeof node[key], "string", `${route}: ${node["@type"]}.${key} must be a string`);
      }
      for (const key of ["datePublished", "dateModified"]) {
        if (key in node) assert.match(node[key], ISO_DATE, `${route}: ${key} must be ISO 8601`);
      }
      if (node.url) assert.match(node.url, /^https:\/\//);
      for (const item of node.itemListElement ?? []) {
        assert.equal(typeof item.position, "number", `${route}: ListItem.position must be a number`);
      }
    }
  }
}

export async function validateStaticSite() {
  for (const [route, file] of routes) {
    const html = await read(file);
    assert.match(html, /<link rel="canonical" href="https:\/\/upgraderupgradeyourskins\.wiki/);
    assert.match(html, /NewGame/);
    assert.match(html, /Upgrader/);
    assert.match(html, /1,500/);
    assert.match(html, /1,000/);
    assert.match(html, /2026-10-06/);
    validateJsonLd(route, html);
    if (route === "/codes/") {
      assert.match(html, /UPGRADER Roblox codes \(October 2026\)/);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await validateStaticSite();
}
