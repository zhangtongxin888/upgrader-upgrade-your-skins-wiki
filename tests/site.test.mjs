import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateJsonLd } from "../scripts/validate-static.mjs";

const out = new URL("../", import.meta.url);
const read = (rel) => readFile(new URL(rel, out), "utf8");

test("codes page answers upgrader roblox codes", async () => {
  const html = await read("codes/index.html");
  assert.match(html, /NewGame/);
  assert.match(html, /Upgrader/);
  assert.match(html, /How to redeem/);
});

test("home links to codes hub and leads with codes intent", async () => {
  const html = await read("index.html");
  assert.match(html, /href="\/codes\/"/);
  assert.match(html, /UPGRADER Roblox codes/);
});

test("every page ships strict, correctly typed JSON-LD", async () => {
  for (const [route, file] of [["/", "index.html"], ["/codes/", "codes/index.html"]]) {
    validateJsonLd(route, await read(file));
  }
});
