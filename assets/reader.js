/* Open Line — chapter reader.
   Paginates the chapter to fit the viewport, then binds the pages onto
   flipping sheets. Two pages side by side on a wide screen, one on a narrow
   one. Without JavaScript the source prose stays in the document and is
   simply read by scrolling. */
(function () {
  'use strict';

  var stage    = document.getElementById('book');
  var source   = document.getElementById('source');
  if (!stage || !source) return;

  var stackEl  = stage.querySelector('.leaf-stack');
  var leftEl   = stage.querySelector('.cover-left');
  var prevBtn  = document.getElementById('prev');
  var nextBtn  = document.getElementById('next');
  var counter  = document.getElementById('counter');
  var barFill  = document.getElementById('barfill');

  var SPREAD_MIN = 821;
  var blocks = Array.prototype.slice.call(source.children);
  var pages = [], sheets = [], flipped = 0, spread = false, animating = false;
  var anchor = 0;      // page index we are trying to keep visible across relayouts
  var settled = false; // until the first render lands, the URL leads and we follow

  function hashPage() {
    var m = /^#p(\d+)$/.exec(location.hash || '');
    return m ? Math.max(0, parseInt(m[1], 10)) : 0;
  }

  /* ---------------- measuring ---------------- */

  /* The probe has to sit inside a box the exact size of one page face.
     .page uses percentage padding, which resolves against its containing
     block's width, so measuring it against the full book would compute
     padding for a page twice as wide as the real one. */
  var probeWrap = document.createElement('div');
  probeWrap.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:-99999px;top:0;';
  var probe = document.createElement('div');
  probe.className = 'page';
  probe.innerHTML = '<div class="page-body"></div><div class="folio"><span class="bk">Open Line</span><span>00</span></div>';
  probeWrap.appendChild(probe);
  var probeBody = probe.querySelector('.page-body');

  function sizeProbe() {
    var w = stage.clientWidth, h = stage.clientHeight;
    // a face carries a 1px border, so its content box is smaller than the book
    probeWrap.style.width = ((spread ? w / 2 : w) - 1) + 'px';
    // 2px for the face border, plus a little slack so sub-pixel rounding
    // can never clip the last line of a page
    probeWrap.style.height = (h - 8) + 'px';
  }

  function over() { return probeBody.scrollHeight > probeBody.clientHeight + 1; }

  /* Pour one source block into the probe. Returns null if all of it fitted,
     the block itself if none of it did, or a remainder block to carry over. */
  function pour(src) {
    // a figure is one object: it either fits whole or it moves to the next page,
    // never split so that the artwork lands on one page and its caption on another
    if (src.tagName === 'FIGURE' || src.querySelector && src.querySelector('img')) {
      probeBody.appendChild(src.cloneNode(true));
      if (!over()) return null;
      probeBody.removeChild(probeBody.lastChild);
      return src;
    }

    var shell = src.cloneNode(false);
    probeBody.appendChild(shell);
    var rest = src.cloneNode(false);
    var spilled = false;
    var kids = Array.prototype.slice.call(src.childNodes);

    for (var i = 0; i < kids.length; i++) {
      var node = kids[i];
      if (spilled) { rest.appendChild(node.cloneNode(true)); continue; }

      if (node.nodeType === 3) {
        var words = node.nodeValue.split(/(\s+)/);
        var tn = document.createTextNode('');
        shell.appendChild(tn);
        var w = 0;
        while (w < words.length) {
          // add a chunk, then walk back a word at a time if it spilled
          var mark = tn.nodeValue, chunk = words.slice(w, w + 20).join('');
          tn.nodeValue = mark + chunk;
          if (over()) {
            tn.nodeValue = mark;
            var k = w;
            while (k < words.length) {
              var keep = tn.nodeValue;
              tn.nodeValue = keep + words[k];
              if (over()) { tn.nodeValue = keep; break; }
              k++;
            }
            spilled = true;
            rest.appendChild(document.createTextNode(words.slice(k).join('')));
            break;
          }
          w += 20;
        }
      } else {
        shell.appendChild(node.cloneNode(true));
        if (over()) {
          shell.removeChild(shell.lastChild);
          spilled = true;
          rest.appendChild(node.cloneNode(true));
        }
      }
    }

    if (!spilled) return null;
    if (!shell.textContent.trim() && !shell.querySelector('img')) {
      probeBody.removeChild(shell);
      return src;
    }
    return rest;
  }

  function paginate() {
    sizeProbe();
    stage.appendChild(probeWrap);
    probeBody.innerHTML = '';

    var out = [], queue = blocks.map(function (b) { return b.cloneNode(true); });
    var guard = 0;

    while (queue.length && guard++ < 400) {
      var el = queue.shift();
      var rest = pour(el);
      if (!rest) continue;

      if (rest === el) {
        if (probeBody.childNodes.length) {          // try it on a fresh page
          out.push(probeBody.innerHTML);
          probeBody.innerHTML = '';
          queue.unshift(el);
        } else {                                    // taller than any page: let it ride
          probeBody.appendChild(el);
          out.push(probeBody.innerHTML);
          probeBody.innerHTML = '';
        }
        continue;
      }
      out.push(probeBody.innerHTML);
      probeBody.innerHTML = '';
      queue.unshift(rest);
    }
    if (probeBody.textContent.trim()) out.push(probeBody.innerHTML);

    stage.removeChild(probeWrap);
    return out;
  }

  /* ---------------- building ---------------- */

  function board(html) { return '<div class="page board">' + html + '</div>'; }

  var frontBoard = board(
    '<p class="ch-num">Chapter One</p>' +
    '<p class="bt">The Button<br>That Cannot Wait</p>' +
    '<div class="rule"></div>' +
    '<p class="bs">From <em>Open Line</em>: rebuilding trading-floor voice on WebRTC and Kubernetes, and the invariants that would not move.</p>' +
    '<p class="ba">Amar Akshat<br>Steve Phillips</p>');

  var endBoard = board(
    '<p class="ch-num">End of Chapter One</p>' +
    '<p class="bt">Chapter Two<br>waits in the book</p>' +
    '<div class="rule"></div>' +
    '<p class="bs">Sixteen more chapters, an epilogue and thirty-three diagrams follow this one.</p>' +
    '<p class="ba"><a href="https://www.amazon.com/Open-Line-Rebuilding-trading-floor-Kubernetes-ebook/dp/B0HHG6NGFH/" target="_blank" rel="noopener">Get it on Kindle</a></p>');

  function wrap(bodyHTML, n, total) {
    return '<div class="page">' +
             '<div class="page-body">' + bodyHTML + '</div>' +
             '<div class="folio"><span class="bk">Open Line</span><span>' + n + ' / ' + total + '</span></div>' +
           '</div>';
  }

  function build() {
    var body = paginate();
    var total = body.length;

    pages = [frontBoard];
    for (var i = 0; i < total; i++) pages.push(wrap(body[i], i + 1, total));
    pages.push(endBoard);

    // sheets carry two faces, so an odd count would leave a torn last leaf
    if (spread && pages.length % 2) pages.push('<div class="page"></div>');

    stackEl.innerHTML = '';
    sheets = [];

    var count = spread ? Math.ceil(pages.length / 2) : pages.length - 1;
    for (var s = 0; s < count; s++) {
      var front = spread ? pages[2 * s]     : pages[s];
      var back  = spread ? (pages[2 * s + 1] || '') : (pages[s + 1] || '');
      var sheet = document.createElement('div');
      sheet.className = 'sheet';
      sheet.innerHTML = '<div class="face front">' + front + '</div>' +
                        '<div class="face back">'  + back  + '</div>';
      stackEl.appendChild(sheet);
      sheets.push(sheet);
    }

    flipped = spread ? Math.min(Math.floor((anchor + 1) / 2), sheets.length)
                     : Math.min(anchor, sheets.length);
    render(true);
  }

  /* a page can be linked to directly, as #p7 */
  function fromHash() {
    if (!pages.length) return;
    var p = Math.min(hashPage(), pages.length - 1);
    if (p === anchor) return;
    flipped = spread ? Math.min(Math.ceil(p / 2), sheets.length) : Math.min(p, sheets.length);
    render(true);
  }

  /* ---------------- rendering ---------------- */

  function render(instant) {
    stage.classList.toggle('single', !spread);

    for (var i = 0; i < sheets.length; i++) {
      var sh = sheets[i], isFlipped = i < flipped;
      if (instant) sh.classList.add('instant');
      sh.classList.toggle('flipped', isFlipped);
      sh.style.zIndex = isFlipped ? i : (sheets.length - i);
      sh.setAttribute('aria-hidden', (i === flipped || i === flipped - 1) ? 'false' : 'true');
    }
    if (instant) {
      void stackEl.offsetWidth;
      for (var j = 0; j < sheets.length; j++) sheets[j].classList.remove('instant');
    }

    // the left board shows the page behind the flipped stack
    if (leftEl) {
      var li = spread ? 2 * flipped - 1 : -1;
      leftEl.innerHTML = (li >= 0 && pages[li]) ? pages[li] : '';
    }

    anchor = spread ? Math.max(0, 2 * flipped) : flipped;

    var shown = spread ? Math.min(2 * flipped + 1, pages.length) : flipped + 1;
    counter.textContent = shown + ' of ' + pages.length;
    barFill.style.width = ((flipped / Math.max(1, sheets.length)) * 100) + '%';

    prevBtn.disabled = flipped <= 0;
    nextBtn.disabled = flipped >= sheets.length;

    if (settled) {
      var want = anchor > 0 ? '#p' + anchor : '';
      if ((location.hash || '') !== want) {
        try { history.replaceState(null, '', want || location.pathname); } catch (e) {}
      }
    }
  }

  function go(delta) {
    var next = flipped + delta;
    if (next < 0 || next > sheets.length || animating) return;
    animating = true;
    var moving = sheets[delta > 0 ? flipped : flipped - 1];
    if (moving) moving.style.zIndex = sheets.length + 5;
    flipped = next;
    render(false);
    setTimeout(function () { animating = false; render(false); }, 790);
  }

  /* ---------------- input ---------------- */

  nextBtn.addEventListener('click', function () { go(1); });
  prevBtn.addEventListener('click', function () { go(-1); });

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
    else if (e.key === 'Home') { flipped = 0; render(true); }
    else if (e.key === 'End') { flipped = sheets.length; render(true); }
  });

  stage.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    var r = stage.getBoundingClientRect();
    go(e.clientX - r.left > r.width / 2 ? 1 : -1);
  });

  var x0 = null, y0 = null;
  stage.addEventListener('touchstart', function (e) {
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    x0 = y0 = null;
  }, { passive: true });

  /* ---------------- lifecycle ---------------- */

  function boot() {
    spread = window.innerWidth >= SPREAD_MIN;
    source.hidden = true;
    document.body.classList.add('js-reader');
    anchor = hashPage();
    build();
    settled = true;
  }

  var t;
  window.addEventListener('hashchange', fromHash);

  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () {
      var wasSpread = spread;
      spread = window.innerWidth >= SPREAD_MIN;
      if (wasSpread !== spread || Math.abs(stage.clientWidth - (stage._w || 0)) > 4) {
        stage._w = stage.clientWidth;
        build();
      }
    }, 220);
  });

  // figures need real heights before anything can be measured
  var imgs = source.querySelectorAll('img'), pending = imgs.length;
  if (!pending) { boot(); }
  else {
    var done = function () { if (--pending <= 0) boot(); };
    Array.prototype.forEach.call(imgs, function (im) {
      if (im.complete) done();
      else { im.addEventListener('load', done); im.addEventListener('error', done); }
    });
    setTimeout(function () { if (pending > 0) { pending = 0; boot(); } }, 2500);
  }
})();
