import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const out = new URL("../out/", import.meta.url);
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
