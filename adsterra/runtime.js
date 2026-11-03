/* Adsterra static runtime for plain HTML exports.
   Load with <script src="/adsterra/runtime.js" defer></script>
   after <script type="application/json" id="adsterra-config">.
   This file is a classic script. It has no module statement, because a
   deferred classic script tag does not run one and the page then makes
   zero ad requests.
   Local change (foreverago-wiki, theescapists3wiki): banners are queued until the previous
   banner script loads (upstream waited only 50 ms, so atOptions raced), and
   the top banner picks the widest variant allowed by the screen (upstream
   always ended on the 320x50 entry).
   Local change (2026-10-23, shared by every Adsterra Popunder site): Popunder
   capped at 3 per visitor per local calendar day (localStorage). A page view
   counts once, on its first click after the Popunder script has loaded.
   Local change (2026-10-28, Pop + Social Bar only): banner/native slots are
   never mounted (pages carry no ad slots). Social Bar is capped at 3 page
   loads per visitor per local day (own localStorage key), inserted 4 s after
   load into document.body (never a hidden container), and only on pages
   that are not legal pages or 404 (cleanPage / CLEAN paths / 404 title). */
(function () {
  "use strict";

  var CLEAN = {
    about: 1,
    accessibility: 1,
    "advertising-policy": 1,
    "affiliate-disclosure": 1,
    contact: 1,
    "cookie-policy": 1,
    cookies: 1,
    disclosure: 1,
    dmca: 1,
    "editorial-policy": 1,
    legal: 1,
    privacy: 1,
    sources: 1,
    terms: 1
  };

  function cleanPath() {
    var parts = String(window.location.pathname || "").split("/");
    for (var i = 0; i < parts.length; i += 1) {
      if (CLEAN[parts[i].toLowerCase()]) return true;
    }
    return false;
  }

  function readConfig() {
    var node = document.getElementById("adsterra-config");
    if (!node) return null;
    try {
      return JSON.parse(node.textContent || "");
    } catch (error) {
      return null;
    }
  }

  function visibleCount() {
    return document.querySelectorAll("aside.ad-placement").length;
  }

  function chooseVariant(slot) {
    var variants = slot.variants || [];
    if (!variants.length) return slot;
    var width = window.innerWidth || 0;
    var selected = null;
    var best = -1;
    for (var i = 0; i < variants.length; i += 1) {
      var variant = variants[i];
      var minWidth = Number(variant.minWidth || 0);
      /* Pick the widest variant the screen allows, whatever the list order. */
      if (width >= minWidth && minWidth > best) {
        selected = variant;
        best = minWidth;
      }
    }
    return selected || variants[variants.length - 1];
  }

  function mountBanner(host, slot) {
    var chosen = chooseVariant(slot);
    var key = chosen.key;
    var scriptUrl = chosen.scriptUrl;
    if (!key || !scriptUrl) return;
    window.atOptions = {
      key: key,
      format: "iframe",
      height: Number(chosen.height),
      width: Number(chosen.width),
      params: {}
    };
    var script = document.createElement("script");
    script.async = true;
    script.src = scriptUrl;
    host.appendChild(script);
    return script;
  }

  function mountNative(host, slot) {
    if (!slot.containerId || !slot.scriptUrl) return;
    var container = document.createElement("div");
    container.id = slot.containerId;
    host.appendChild(container);
    var script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.src = slot.scriptUrl;
    host.appendChild(script);
  }

  function mountSlots(slots) {
    var queue = Promise.resolve();
    slots.forEach(function (slot) {
      queue = queue.then(function () {
        return new Promise(function (resolve) {
          var host = document.querySelector('[data-ad-host="' + slot.id + '"]');
          if (!host) {
            resolve();
            return;
          }
          if (slot.format === "native") {
            mountNative(host, slot);
            window.setTimeout(resolve, 50);
            return;
          }
          /* Banner snippets read the global atOptions when their script runs,
             so the next banner must wait until this one has loaded. */
          var script = mountBanner(host, slot);
          if (!script) {
            resolve();
            return;
          }
          var done = false;
          var finish = function () {
            if (done) return;
            done = true;
            window.setTimeout(resolve, 300);
          };
          script.addEventListener("load", finish);
          script.addEventListener("error", finish);
          window.setTimeout(finish, 5000);
        });
      });
    });
  }

  function addScript(id, url) {
    if (!url || document.getElementById(id)) return;
    var script = document.createElement("script");
    script.id = id;
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.src = url;
    document.body.appendChild(script);
  }

  /* Popunder: at most POP_DAILY_MAX per visitor per local calendar day.
     The Adsterra Popunder script, once loaded, opens a popunder on a user
     click, so each page view that receives a click after the script loaded
     is counted once. When today's count has reached the cap, the script is
     not inserted at all, so no Popunder request is made. A click before the
     script loads, or a failed load, never counts. The count lives in
     localStorage as {"d":"YYYY-MM-DD","n":count} and resets on a new day.
     If storage is unavailable the script is not loaded (fail closed). */
  var POP_KEY = "adsterra-popunder-daily";
  var POP_DAILY_MAX = 3;
  function today() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }
  function readPopCount() {
    try {
      var raw = JSON.parse(window.localStorage.getItem(POP_KEY) || "null");
      if (raw && raw.d === today()) return Number(raw.n) || 0;
      return 0;
    } catch (e) {
      return -1;
    }
  }
  function countPop() {
    try {
      var n = readPopCount();
      if (n < 0) n = 0;
      window.localStorage.setItem(POP_KEY, JSON.stringify({ d: today(), n: n + 1 }));
    } catch (e) {}
  }
  function addPopunder(url) {
    if (!url || document.getElementById("adsterra-popunder")) return;
    var used = readPopCount();
    if (used < 0 || used >= POP_DAILY_MAX) return;
    var script = document.createElement("script");
    script.id = "adsterra-popunder";
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.addEventListener("load", function () {
      document.addEventListener("click", countPop, { capture: true, once: true });
    });
    script.src = url;
    document.body.appendChild(script);
  }

  var SB_KEY = "adsterra-socialbar-daily";
  var SB_DAILY_MAX = 3;
  var SB_DELAY_MS = 4000;
  function readSbCount() {
    try {
      var raw = JSON.parse(window.localStorage.getItem(SB_KEY) || "null");
      if (raw && raw.d === today()) return Number(raw.n) || 0;
      return 0;
    } catch (e) {
      return -1;
    }
  }
  function addSocialBar(url) {
    if (!url || document.getElementById("adsterra-social-bar")) return;
    var used = readSbCount();
    if (used < 0 || used >= SB_DAILY_MAX) return;
    window.setTimeout(function () {
      if (document.getElementById("adsterra-social-bar")) return;
      var n = readSbCount();
      if (n < 0 || n >= SB_DAILY_MAX) return;
      try {
        window.localStorage.setItem(SB_KEY, JSON.stringify({ d: today(), n: n + 1 }));
      } catch (e) {
        return;
      }
      var script = document.createElement("script");
      script.id = "adsterra-social-bar";
      script.async = true;
      script.setAttribute("data-cfasync", "false");
      script.src = url;
      document.body.appendChild(script);
    }, SB_DELAY_MS);
  }
  function notFoundPage() {
    var t = String(document.title || "").toLowerCase();
    return /(^|\D)404(\D|$)|not found/.test(t);
  }

  var config = readConfig();
  if (!config || config.adNetwork !== "adsterra" || config.status !== "ready") return;
  if (config.cleanPage || cleanPath() || notFoundPage()) return;
  /* Pop + Social Bar only: banner and native slots are not mounted. */
  if (config.enablePopunder && config.popunderScriptUrl) {
    addPopunder(config.popunderScriptUrl);
  }
  if (config.enableSocialBar && config.socialBarScriptUrl) {
    addSocialBar(config.socialBarScriptUrl);
  }
})();
