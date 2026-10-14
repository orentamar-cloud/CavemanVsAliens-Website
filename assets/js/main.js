/*
 * Caveman vs Aliens — site script
 * Vanilla JS only. No trackers, no analytics, no external libraries.
 * Handles: mobile nav toggle (keyboard + click + Escape), a subtle
 * scroll-reveal for section content, the Google Play download CTA
 * (device-aware: direct navigation on mobile, an in-site modal on
 * desktop), the "See It in Action" media modal, and the Gameplay carousel
 * controls.
 */
(function () {
  "use strict";

  /* ==========================================================================
     SINGLE SOURCE OF TRUTH — Google Play Store URL
     ==========================================================================
     This is intentionally EMPTY right now. No official Google Play listing
     URL exists yet for Caveman vs Aliens, and we do not invent one (not the
     Play Console "Internal Testing" link, not a guessed package URL).

     When the real, public Google Play Store URL is ready, paste it here as
     a plain string, e.g.:
       var GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.lobala.cornerman";

     That single change is all that's needed — it automatically feeds:
       1. The mobile "direct to store" navigation behavior below, and
       2. The desktop modal's QR code + "Open Google Play" button.
     Until it's set, every entry point shows a safe "Coming Soon" state
     instead of a broken or fake link.
     ========================================================================== */
  var GOOGLE_PLAY_URL = "";

  function isMobileDevice() {
    // Standard UA check used for store-redirect buttons. Paired with a
    // pointer/width check so a narrow desktop window doesn't get treated
    // as "mobile" and skip the modal.
    var uaIsMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    var narrowTouch = window.matchMedia &&
      window.matchMedia("(max-width: 760px)").matches &&
      window.matchMedia("(pointer: coarse)").matches;
    return uaIsMobile || !!narrowTouch;
  }

  function initNav() {
    var toggle = document.querySelector("[data-nav-toggle]");
    var menu = document.querySelector("[data-mobile-menu]");
    if (!toggle || !menu) return;

    function closeMenu() {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
    function openMenu() {
      menu.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
    }

    toggle.addEventListener("click", function () {
      var isOpen = toggle.getAttribute("aria-expanded") === "true";
      if (isOpen) closeMenu(); else openMenu();
    });

    // Close on any link/button inside the menu, not just a bare <a> click:
    // Watch Trailer is a <button> containing an <svg> icon, so a click can
    // land on the svg/path first. closest() catches the real control
    // regardless of which descendant was the exact click target.
    menu.addEventListener("click", function (e) {
      var actionable = e.target.closest && e.target.closest("a, button");
      if (actionable) closeMenu();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });

    // Close the mobile menu whenever the real hamburger toggle becomes
    // hidden, so resizing or rotating across a nav breakpoint never leaves
    // a stale open menu behind. This reads the toggle's actual computed
    // visibility instead of a single hardcoded width, because the
    // breakpoint isn't the same on every page: index.html's Hero hands
    // navigation to its own baked-in overlay at 700px, while the Privacy/
    // Support pages' capsule nav only takes over at 860px.
    function closeIfTogglerHidden() {
      if (getComputedStyle(toggle).display === "none") closeMenu();
    }
    window.addEventListener("resize", closeIfTogglerHidden);
    window.addEventListener("orientationchange", closeIfTogglerHidden);
    if (window.matchMedia) {
      ["(min-width: 700px)", "(min-width: 860px)", "(min-width: 960px)"].forEach(function (q) {
        var mq = window.matchMedia(q);
        if (mq.addEventListener) mq.addEventListener("change", closeIfTogglerHidden);
      });
    }
  }

  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    items.forEach(function (el) { observer.observe(el); });
  }

  /* ---------- Generic accessible modal (used by the Play + media modals) ---------- */
  var FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea, input, select, video[controls], [tabindex]:not([tabindex="-1"])';
  var activeModal = null;
  var lastFocusedEl = null;

  // The Google Play modal keeps both its "live" state (hidden while
  // GOOGLE_PLAY_URL is empty) and its "coming soon" state in the DOM at
  // once, toggling which is visible with the `hidden` attribute.
  // querySelectorAll(FOCUSABLE_SELECTOR) matches elements by tag/attribute
  // only — it has no idea an ancestor is display:none — so without this
  // filter the trap would still cycle Tab onto the [data-play-open-link]
  // anchor sitting inside the hidden [data-play-live] block. Filtering on
  // offsetParent !== null excludes anything inside a hidden/display:none
  // ancestor while keeping everything actually visible in the modal.
  function getFocusable(container) {
    var all = container.querySelectorAll(FOCUSABLE_SELECTOR);
    var visible = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].offsetParent !== null) visible.push(all[i]);
    }
    return visible;
  }

  function trapFocus(e) {
    if (!activeModal || e.key !== "Tab") return;
    var focusable = getFocusable(activeModal);
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function openModal(overlay) {
    if (!overlay) return;
    lastFocusedEl = document.activeElement;
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    activeModal = overlay;

    var card = overlay.querySelector(".modal-card");
    var closeBtn = overlay.querySelector(".modal-close");
    (closeBtn || card).focus();

    document.addEventListener("keydown", handleModalKeydown);
  }

  function closeModal(overlay) {
    if (!overlay) return;
    // Any modal containing a <video> (the trailer) pauses it on every close
    // path: close button, Escape and backdrop all funnel through here.
    var vids = overlay.querySelectorAll("video");
    for (var v = 0; v < vids.length; v++) vids[v].pause();
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
    if (activeModal === overlay) activeModal = null;
    document.removeEventListener("keydown", handleModalKeydown);
    // Lets a modal reset its own state (e.g. the media modal returns to
    // its two-card view and releases the video) on every close path.
    overlay.dispatchEvent(new CustomEvent("modal:close"));
    // If the opener is no longer rendered (e.g. it lived in the mobile
    // menu, which closes itself on click), fall back to the menu toggle so
    // focus never drops to the top of the page.
    var back = lastFocusedEl;
    if (back && back.getClientRects && back.getClientRects().length === 0) {
      back = document.querySelector("[data-nav-toggle]");
    }
    if (back && typeof back.focus === "function") {
      back.focus({ preventScroll: true });
    }
  }

  function handleModalKeydown(e) {
    if (e.key === "Escape") {
      if (activeModal) closeModal(activeModal);
    } else {
      trapFocus(e);
    }
  }

  function initModals() {
    var overlays = document.querySelectorAll(".modal-overlay");
    overlays.forEach(function (overlay) {
      overlay.setAttribute("aria-hidden", "true");

      // Click on the backdrop (not the card itself) closes the modal.
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) closeModal(overlay);
      });

      var closeBtn = overlay.querySelector(".modal-close");
      if (closeBtn) {
        closeBtn.addEventListener("click", function () { closeModal(overlay); });
      }
    });
  }

  /* ---------- Google Play CTA ---------- */
  function initGooglePlay() {
    var triggers = document.querySelectorAll("[data-open-play]");
    if (!triggers.length) return;

    var overlay = document.getElementById("googlePlayModal");
    var comingSoon = overlay ? overlay.querySelector("[data-play-coming-soon]") : null;
    var liveContent = overlay ? overlay.querySelector("[data-play-live]") : null;
    var openLink = overlay ? overlay.querySelector("[data-play-open-link]") : null;
    var qrImg = overlay ? overlay.querySelector("[data-play-qr-img]") : null;

    var hasUrl = !!GOOGLE_PLAY_URL;

    if (overlay) {
      if (hasUrl) {
        if (comingSoon) comingSoon.hidden = true;
        if (liveContent) liveContent.hidden = false;
        if (openLink) openLink.href = GOOGLE_PLAY_URL;
        if (qrImg) {
          // A QR image pointed at GOOGLE_PLAY_URL would be generated here
          // once a real store URL exists. Left unset intentionally — we
          // do not fabricate a QR code for a link that doesn't exist yet.
        }
      } else {
        if (comingSoon) comingSoon.hidden = false;
        if (liveContent) liveContent.hidden = true;
      }
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        if (hasUrl && isMobileDevice()) {
          // Mobile with a live URL: go straight to the store, no modal.
          window.location.href = GOOGLE_PLAY_URL;
          return;
        }
        // Desktop, or mobile with no live URL yet: show the accessible modal
        // (either the QR/"Open Google Play" state, or the Coming Soon state).
        openModal(overlay);
      });
    });
  }

  /* ---------- See It in Action (two-card media modal, truly lazy video) ----------
     The modal opens on a two-card chooser (Game Intro / Voice Commands).
     The single <video> ships with no src and no poster: choosing a card
     copies that card's data-video / data-poster onto it and starts load(),
     so no MP4 is requested at page load or when the chooser merely opens,
     and the two videos are never preloaded together. Choosing a card is an
     explicit user action, so playback is attempted from that click; if the
     browser refuses, the controls simply stay ready. Back and close (X /
     Escape / backdrop) both pause and release the
     video (src removed, in-flight download cancelled), then the modal
     returns to the chooser. Internal "trailer" identifiers are kept on
     purpose: renaming them has no user-visible benefit. */
  function initMedia() {
    var overlay = document.getElementById("trailerModal");
    var triggers = document.querySelectorAll("[data-open-trailer]");
    if (!overlay || !triggers.length) return;

    var card = overlay.querySelector(".modal-media");
    var selectView = overlay.querySelector("[data-media-select]");
    var playerView = overlay.querySelector("[data-media-player]");
    var video = overlay.querySelector("video");
    var label = overlay.querySelector("[data-media-label]");
    var back = overlay.querySelector("[data-media-back]");
    var cards = overlay.querySelectorAll("[data-media-card]");
    var lastCard = null;
    if (!card || !selectView || !playerView || !video) return;

    function releaseVideo() {
      video.pause();
      if (video.getAttribute("src")) {
        video.removeAttribute("src");
        video.removeAttribute("poster");
        video.load(); // with no src this cancels any in-flight download
      }
    }

    function showSelect() {
      releaseVideo();
      playerView.hidden = true;
      selectView.hidden = false;
      card.setAttribute("data-media-state", "select");
      overlay.setAttribute("aria-labelledby", "mediaSelectTitle");
    }

    function showPlayer(cardEl) {
      var name = cardEl.getAttribute("data-label") || "";
      lastCard = cardEl;
      if (label) label.textContent = name;
      video.setAttribute("aria-label", name.charAt(0) + name.slice(1).toLowerCase() + " video");
      video.poster = cardEl.getAttribute("data-poster") || "";
      video.preload = "auto";
      video.src = cardEl.getAttribute("data-video");
      selectView.hidden = true;
      playerView.hidden = false;
      card.setAttribute("data-media-state", "player");
      overlay.setAttribute("aria-labelledby", "mediaPlayerTitle");
      video.load();
      video.focus();
      var attempt = video.play();
      if (attempt && typeof attempt.catch === "function") attempt.catch(function () {});
    }

    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        showSelect();
        openModal(overlay);
      });
    });

    cards.forEach(function (c) {
      c.addEventListener("click", function () { showPlayer(c); });
    });

    if (back) {
      back.addEventListener("click", function () {
        showSelect();
        (lastCard || cards[0]).focus();
      });
    }

    overlay.addEventListener("modal:close", showSelect);
  }

  /* ---------- Gameplay carousel (isolated; touches only [data-carousel]) ----------
     The track is native horizontal scrolling + scroll-snap (CSS), so swipe,
     trackpad and wheel work without this. This adds Prev/Next buttons, their
     disabled state, arrow-key support, and slide labels. Slide step is
     measured from the real layout (slide width + gap), never hardcoded. */
  function initCarousels() {
    var carousels = document.querySelectorAll("[data-carousel]");
    carousels.forEach(function (root) {
      var track = root.querySelector("[data-carousel-track]");
      var prev = root.querySelector("[data-carousel-prev]");
      var next = root.querySelector("[data-carousel-next]");
      if (!track || !prev || !next) return;

      var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var slides = Array.prototype.slice.call(track.children);

      // Label slides here so adding one later needs no manual "n of N" upkeep.
      slides.forEach(function (slide, i) {
        slide.setAttribute("role", "group");
        slide.setAttribute("aria-roledescription", "slide");
        slide.setAttribute("aria-label", (i + 1) + " of " + slides.length);
      });

      function step() {
        if (slides.length > 1) {
          var d = slides[1].offsetLeft - slides[0].offsetLeft;
          if (d > 0) return d;
        }
        return slides[0] ? slides[0].getBoundingClientRect().width : track.clientWidth;
      }

      function update() {
        var max = track.scrollWidth - track.clientWidth;
        var fits = max <= 1;
        prev.hidden = fits;
        next.hidden = fits;
        var hadFocus = document.activeElement;
        prev.disabled = track.scrollLeft <= 1;
        next.disabled = track.scrollLeft >= max - 1;
        // A button that just disabled itself drops keyboard focus; hand it to
        // the opposite button so keyboard users aren't stranded at either end.
        if (hadFocus === next && next.disabled && !prev.disabled && !prev.hidden) prev.focus();
        else if (hadFocus === prev && prev.disabled && !next.disabled && !next.hidden) next.focus();
      }

      function go(dir) {
        var s = step();
        var index = Math.round(track.scrollLeft / s) + dir;
        index = Math.max(0, Math.min(slides.length - 1, index));
        var left = index * s;
        var max = track.scrollWidth - track.clientWidth;
        track.scrollTo({ left: Math.min(left, max), behavior: reduceMotion ? "auto" : "smooth" });
      }

      prev.addEventListener("click", function () { go(-1); });
      next.addEventListener("click", function () { go(1); });

      root.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      });

      var ticking = false;
      track.addEventListener("scroll", function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () { ticking = false; update(); });
      }, { passive: true });

      window.addEventListener("resize", update);
      if ("ResizeObserver" in window) new ResizeObserver(update).observe(track);
      update();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initReveal();
    initModals();
    initGooglePlay();
    initMedia();
    initCarousels();
  });
})();
