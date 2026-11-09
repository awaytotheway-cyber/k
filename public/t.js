/*!
 * TrueROAS tracking snippet.
 *
 * Served from the customer's own domain, so the cookie it sets is first-party
 * and survives Safari's tracking prevention and most ad blockers.
 *
 * What it does, and nothing more:
 *   - keeps one durable visitor id in a first-party cookie
 *   - reports each page view with its URL and referrer, so the server can read
 *     the ad click id the ad platform put there
 *   - follows single-page-app route changes
 *   - exposes identify() to attach an email once the visitor gives you one
 *
 * What it deliberately does not do: fingerprint the device, read form fields,
 * record sessions, or send anything from the page body. The server stores a
 * salted hash of the IP, never the address itself.
 *
 * No dependencies, no build step. Keep it small.
 */
(function (window, document) {
  "use strict";

  var script =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName("script");
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].src && all[i].src.indexOf("/t.js") !== -1) return all[i];
      }
      return null;
    })();

  if (!script) return;

  var key = script.getAttribute("data-key");
  if (!key) return;

  // Endpoint lives wherever this script came from.
  var origin = script.src.replace(/\/t\.js(\?.*)?$/, "");
  var COOKIE = "_tr_vid";
  var SESSION = "_tr_sid";
  var YEAR = 31536000;

  function readCookie(name) {
    var match = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function writeCookie(name, value, seconds) {
    var secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; path=/; max-age=" +
      seconds +
      "; samesite=lax" +
      secure;
  }

  function uid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function visitorId() {
    var existing = readCookie(COOKIE);
    if (existing) {
      // Refresh the window so an active visitor is never aged out.
      writeCookie(COOKIE, existing, YEAR);
      return existing;
    }
    var created = uid();
    writeCookie(COOKIE, created, YEAR);
    return created;
  }

  function sessionId() {
    try {
      var existing = window.sessionStorage.getItem(SESSION);
      if (existing) return existing;
      var created = uid();
      window.sessionStorage.setItem(SESSION, created);
      return created;
    } catch {
      // Private mode or blocked storage: a per-pageview id still groups nothing
      // incorrectly, it just loses session grouping.
      return uid();
    }
  }

  /**
   * Content-type text/plain keeps this a CORS "simple request", so there is no
   * preflight round trip on the customer's critical path.
   */
  function send(path, payload) {
    var url = origin + path;
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
        if (navigator.sendBeacon(url, blob)) return;
      }
    } catch {
      /* fall through to fetch */
    }
    try {
      fetch(url, {
        method: "POST",
        body: body,
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        keepalive: true,
        mode: "cors",
        credentials: "omit",
      }).catch(function () {});
    } catch {
      /* tracking must never break the host page */
    }
  }

  var lastUrl = null;

  function pageview(force) {
    var url = location.href;
    // SPA frameworks fire several route events for one navigation.
    if (!force && url === lastUrl) return;
    lastUrl = url;

    send("/api/t/collect", {
      k: key,
      v: visitorId(),
      s: sessionId(),
      u: url,
      r: document.referrer || null,
      t: new Date().toISOString(),
      w: window.screen ? window.screen.width : null,
    });
  }

  /** Attach a known identity to this visitor. Safe to call repeatedly. */
  function identify(email, externalId) {
    if (!email && !externalId) return;
    send("/api/t/identify", {
      k: key,
      v: visitorId(),
      e: email || null,
      x: externalId || null,
    });
  }

  // --- single-page-app route changes --------------------------------------
  function patch(method) {
    var original = history[method];
    if (typeof original !== "function") return;
    history[method] = function () {
      var result = original.apply(this, arguments);
      // Let the framework finish rendering before reading location.
      setTimeout(pageview, 0);
      return result;
    };
  }

  patch("pushState");
  patch("replaceState");
  window.addEventListener("popstate", function () {
    setTimeout(pageview, 0);
  });

  // --- public surface ------------------------------------------------------
  var queued = window.trueroas && window.trueroas.q;

  window.trueroas = {
    identify: identify,
    pageview: function () {
      pageview(true);
    },
    visitorId: visitorId,
  };

  // Replay anything called before this file finished loading.
  if (queued && queued.length) {
    for (var i = 0; i < queued.length; i++) {
      var call = queued[i];
      var fn = window.trueroas[call[0]];
      if (typeof fn === "function") fn.apply(null, call.slice(1));
    }
  }

  pageview(true);
})(window, document);
