/* Adsterra static runtime for GitHub Pages.
   Load with <script src="/adsterra/runtime.js" defer></script>
   after <script type="application/json" id="adsterra-config">.
   This file is a classic script. It has no module statement, because a
   deferred classic script tag does not run one and the page then makes
   zero ad requests.
   Banner snippets share the global atOptions, so each banner script is
   appended only after the previous one loads. document.write from those
   scripts is applied inside the slot and rewritten <script> tags are
   inserted as real elements so follow-up invoke scripts still request.
   Popunder and Social Bar are not loaded. */
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
    "404": 1,
    "404.html": 1,
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
      if (width >= minWidth && minWidth > best) {
        selected = variant;
        best = minWidth;
      }
    }
    return selected || variants[variants.length - 1];
  }

  function injectWritten(host, html) {
    var text = String(html || "");
    var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    var match;
    while ((match = re.exec(text))) {
      var script = document.createElement("script");
      var attrs = match[1] || "";
      var src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
      if (src) script.src = src[1];
      script.async = /\basync\b/i.test(attrs);
      script.setAttribute("data-cfasync", "false");
      if (match[2]) script.text = match[2];
      host.appendChild(script);
    }
    re.lastIndex = 0;
    var rest = text.replace(re, "");
    if (rest && host.insertAdjacentHTML) {
      try {
        host.insertAdjacentHTML("beforeend", rest);
      } catch (error) { /* ignore malformed creative markup */ }
    }
  }

  function installWriter(getHost) {
    var previousWrite = document.write;
    var previousLine = document.writeln;
    document.write = function () {
      var host = getHost();
      if (!host) return;
      injectWritten(host, Array.prototype.join.call(arguments, ""));
    };
    document.writeln = function () {
      var host = getHost();
      if (!host) return;
      injectWritten(host, Array.prototype.join.call(arguments, "") + "\n");
    };
    return function restore() {
      document.write = previousWrite;
      document.writeln = previousLine;
    };
  }

  function createBannerScript(slot) {
    var chosen = chooseVariant(slot);
    var key = chosen.key;
    var scriptUrl = chosen.scriptUrl;
    if (!key || !scriptUrl) return null;
    window.atOptions = {
      key: key,
      format: "iframe",
      height: Number(chosen.height),
      width: Number(chosen.width),
      params: {}
    };
    var script = document.createElement("script");
    script.async = false;
    script.setAttribute("data-cfasync", "false");
    script.src = scriptUrl;
    return script;
  }

  function createNativeScript(host, slot) {
    if (!slot.containerId || !slot.scriptUrl) return null;
    var container = document.createElement("div");
    container.id = slot.containerId;
    host.appendChild(container);
    var script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.src = slot.scriptUrl;
    return script;
  }

  function mountSlots(slots) {
    var currentHost = null;
    var restore = installWriter(function () { return currentHost; });
    var queue = Promise.resolve();
    slots.forEach(function (slot) {
      queue = queue.then(function () {
        return new Promise(function (resolve) {
          var host = document.querySelector('[data-ad-host="' + slot.id + '"]');
          if (!host) {
            resolve();
            return;
          }
          currentHost = host;
          var script = slot.format === "native" ? createNativeScript(host, slot) : createBannerScript(slot);
          if (!script) {
            resolve();
            return;
          }
          var done = false;
          var finish = function () {
            if (done) return;
            done = true;
            window.setTimeout(resolve, slot.format === "native" ? 50 : 300);
          };
          script.addEventListener("load", finish);
          script.addEventListener("error", finish);
          window.setTimeout(finish, 5000);
          host.appendChild(script);
        });
      });
    });
    queue.then(restore, restore);
  }

  var config = readConfig();
  if (!config || config.adNetwork !== "adsterra" || config.status !== "ready") return;
  if (config.cleanPage || cleanPath()) return;
  var slots = Array.isArray(config.slots) ? config.slots.slice(0, 3) : [];
  if (!slots.length || visibleCount() > 3) return;
  mountSlots(slots);
})();
