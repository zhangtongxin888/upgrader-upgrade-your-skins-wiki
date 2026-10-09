/* Adsterra static runtime for plain HTML exports.
   Load with <script src="/adsterra/runtime.js" defer></script>
   after <script type="application/json" id="adsterra-config">.
   This file is a classic script. It has no module statement, because a
   deferred classic script tag does not run one and the page then makes
   zero ad requests.
   Local change (foreverago-wiki, theescapists3wiki): banners are queued until the previous
   banner script loads (upstream waited only 50 ms, so atOptions raced), and
   the top banner picks the widest variant allowed by the screen (upstream
   always ended on the 320x50 entry). */
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
    script.src = url;
    document.body.appendChild(script);
  }

  var config = readConfig();
  if (!config || config.adNetwork !== "adsterra" || config.status !== "ready") return;
  if (config.cleanPage || cleanPath()) return;
  var slots = Array.isArray(config.slots) ? config.slots.slice(0, 3) : [];
  if (visibleCount() > 3) return;
  mountSlots(slots);
  if (config.enablePopunder && config.popunderScriptUrl) {
    addScript("adsterra-popunder", config.popunderScriptUrl);
  }
  if (config.enableSocialBar && config.socialBarScriptUrl && visibleCount() < 3) {
    addScript("adsterra-social-bar", config.socialBarScriptUrl);
  }
})();
