/* site-motion.js — the script half of the motion layer.
 *
 *   <script src="../scripts/site-motion.js" defer></script>
 *
 * It does four things and nothing else: it switches the stylesheet's start
 * states on, reveals sections as they come into view, settles the header once
 * the page scrolls, and counts a figure up to the number already written on the
 * page.
 *
 * THE RULES THIS FILE IS WRITTEN UNDER.
 *
 *   * IT IS WHAT HIDES THINGS, so a failure can never hide them. The class
 *     `js-motion` goes on <html> from here, not from an inline head script: if
 *     this file 404s, parses badly or throws on line one, the stylesheet's
 *     start states never apply and the page is simply a page.
 *   * A FIGURE IS NEVER REWRITTEN. The count-up reads the element's OWN text,
 *     counts to it, and puts that exact text back at the end. Anything that is
 *     not a plain run of digits is left untouched -- "1,500" and "98%" are
 *     statements somebody checked, and parsing them down to a number would put
 *     a different figure in front of a reader. The styleguide's own demo reads
 *     a `data-to` attribute over a zeroed element, which turns 1,500 into 1.
 *   * ONE READ PER ANIMATION FRAME. Scrolling fires continuously; everything
 *     that reads the scroll position shares one listener and runs inside one
 *     requestAnimationFrame callback, and the header is only written when its
 *     state changes.
 *   * NO IDS, NO DEMO MARKUP. The styleguide's own scripts are wired to the ids
 *     of the blocks on its pages. These look for classes, on any number of
 *     elements, and do nothing at all when a page has none of them.
 *   * prefers-reduced-motion: reduce MEANS NOTHING MOVES: everything that would
 *     have been revealed is shown at once, and every figure is written whole.
 *   * No dependencies, and nothing is fetched or reported anywhere.
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  if (!root || !root.classList) return;

  // The one line that switches the stylesheet on. Everything the CSS hides is
  // behind this class, so it is added before anything else can fail.
  root.classList.add('js-motion');

  var reduce = !!(window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var STAGGER_MS = 80;        // the styleguide's own step between siblings
  // How far up the screen the TOP of a section must come before it moves, as a
  // share of the screen's height -- never a share of the section. A section
  // taller than five screens can never have a fifth of itself in view at once,
  // and waiting for that left it at opacity 0 for good (a 6000px section on a
  // 666px screen, measured in Chrome).
  var REVEAL_AT = 0.2;
  var COUNT_AT = 0.3;         // ... and of a band of figures
  var COUNT_MS = 1300;

  function all(selector) {
    try { return Array.prototype.slice.call(doc.querySelectorAll(selector)); } catch (e) { return []; }
  }

  var observes = (typeof IntersectionObserver === 'function')
    || (window && typeof window.IntersectionObserver === 'function');

  // `up` is REVEAL_AT or COUNT_AT: the bottom of the screen is pulled up by that
  // share, and anything at all inside what is left counts, whatever its height.
  function watch(items, up, act) {
    var Observer = (typeof IntersectionObserver === 'function')
      ? IntersectionObserver : window.IntersectionObserver;
    var io = new Observer(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        var el = entries[i].target;
        io.unobserve(el);
        act(el);
      }
    }, { threshold: 0, rootMargin: '0px 0px -' + Math.round(up * 100) + '% 0px' });
    for (var j = 0; j < items.length; j++) io.observe(items[j]);
  }

  // ---- one scroll listener, one read per animation frame -------------------

  var readers = [];
  var queued = false;

  function readAll() {
    queued = false;
    for (var i = 0; i < readers.length; i++) readers[i]();
  }

  function onScroll() {
    if (queued) return;
    queued = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(readAll);
    else readAll();
  }

  function onEveryScroll(read) {
    if (!readers.length) {
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
    }
    readers.push(read);
  }

  // ---- the reveal ----------------------------------------------------------

  // Its position among the `.reveal` elements under the same parent, which is
  // what makes a row of cards arrive one after another instead of together.
  function staggerIndex(el) {
    var parent = el.parentNode;
    if (!parent || !parent.querySelectorAll) return 0;
    var sibs;
    try { sibs = Array.prototype.slice.call(parent.querySelectorAll('.reveal')); } catch (e) { return 0; }
    var at = sibs.indexOf(el);
    return at < 0 ? 0 : at;
  }

  function armReveal() {
    var items = all('.reveal');
    if (!items.length) return;
    if (reduce || !observes) {
      for (var i = 0; i < items.length; i++) items[i].classList.add('in-view');
      return;
    }
    watch(items, REVEAL_AT, function (el) {
      el.style.transitionDelay = (staggerIndex(el) * STAGGER_MS) + 'ms';
      el.classList.add('in-view');
    });

    // The foot of the page. Keying on the top edge leaves the bottom fifth of
    // the screen out, and a page's LAST sections can sit in it with nowhere
    // left to scroll: a closing strip shorter than that band never gets its top
    // above the line (a 100px strip on a 666px screen, measured in Chrome). So
    // once the page is scrolled to its end, or cannot scroll at all, everything
    // still waiting is shown -- and without the measurements to tell, it is
    // shown too.
    var footReached = false;
    function atFoot() {
      if (footReached) return;
      var y = window.pageYOffset || root.scrollTop || 0;
      var view = window.innerHeight || root.clientHeight || 0;
      var height = root.scrollHeight || 0;
      if (view && height && y + view < height - 2) return;
      footReached = true;
      for (var i = 0; i < items.length; i++) items[i].classList.add('in-view');
    }
    onEveryScroll(atFoot);
    if (doc.readyState === 'complete') atFoot();
    else window.addEventListener('load', atFoot);
  }

  // ---- the header, settled -------------------------------------------------

  function armHeader() {
    var headers = all('.site-header');
    if (!headers.length) return;
    var was = [];

    function read() {
      var y = window.pageYOffset || root.scrollTop || 0;
      for (var i = 0; i < headers.length; i++) {
        var el = headers[i];
        var past = el.offsetHeight > 0 ? el.offsetHeight : 1;
        var stuck = y > past;
        if (was[i] === stuck) continue;     // only on a change: no per-frame writes
        was[i] = stuck;
        el.classList.toggle('is-stuck', stuck);
      }
    }

    onEveryScroll(read);
    read();
  }

  // ---- the count-up --------------------------------------------------------

  /** The figure an element is already showing, or null when it is not one. */
  function countTarget(text) {
    var raw = (text === null || text === undefined) ? '' : String(text);
    var trimmed = raw.replace(/^\s+|\s+$/g, '');
    if (!/^[0-9]{1,15}$/.test(trimmed)) return null;
    return { text: raw, to: Number(trimmed) };
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function runCount(el) {
    var want = countTarget(el.textContent);
    if (!want) return;                                  // left exactly as written
    if (reduce || !window.requestAnimationFrame) { el.textContent = want.text; return; }
    var began = null;
    el.textContent = '0';
    var step = function (ts) {
      var now = (typeof ts === 'number') ? ts : Date.now();
      if (began === null) began = now;
      var p = Math.min((now - began) / COUNT_MS, 1);
      if (!(p < 1)) { el.textContent = want.text; return; }    // ends on the page's own text
      el.textContent = String(Math.round(easeOut(p) * want.to));
      window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }

  function armCounters() {
    var items = all('.count-up');
    if (!items.length) return;
    if (reduce || !observes) {
      for (var i = 0; i < items.length; i++) runCount(items[i]);
      return;
    }
    watch(items, COUNT_AT, runCount);
  }

  function arm() { armReveal(); armCounters(); armHeader(); }

  // `defer` means the document is parsed by the time this runs. The guard is
  // for a page that links it some other way.
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', arm);
  else arm();
})();
