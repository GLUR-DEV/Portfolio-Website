/* ==========================================================
   Portfolio landing page – JavaScript (motion)
   1. Sticky header state   2. Code typing effect (one window, below 1440px)
   2b. Code stack on wide screens: random spawn, dragging, glowing connectors
   3. Work card reveal      3b. Card cover takeover layer      3c. Skill pill entrance
   3d. Contact entrance (3, 3c and 3d replay each time they scroll back into view, see inView)
   3e. Hero entrance, line by line (plays once)
   4. Active nav link
   5. Stack pill toggles, project filtering and the mobile project limit
   6. Contact form (sends the message to the server, which stores it in the D1 database)
   7. Lava lamp background (canvas metaballs)
   Everything respects "prefers-reduced-motion".
   This file is shared by index.html and projects.html, so each part skips itself when the
   elements it needs aren't on the page (slideshows live in projectsscript.js).
   ========================================================== */
(() => {
  // Tells the inline fallback in index.html that this script loaded
  document.documentElement.classList.add('js-ready');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Scroll-in replay helper ----------
     Used by the card, skill pill and contact entrances. inView(elements, onEnter, onLeave) calls
     onEnter([...]) with the elements that have just come into view (at least 20% showing; several can
     arrive together, in page order) and onLeave(element) once an element has left the screen completely.
     Because the entrance is switched off again on leaving, it plays again the next time the visitor
     scrolls back to it. With reduced motion, or no IntersectionObserver, everything is shown straight
     away and never hidden again. */
  const inView = (elements, onEnter, onLeave) => {
    const list = Array.from(elements);
    if (!list.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) { onEnter(list); return; }
    const shown = new Set();
    const observer = new IntersectionObserver(entries => {
      const entering = [];
      entries.forEach(entry => {
        const el = entry.target;
        if (entry.intersectionRatio >= 0.2 && !shown.has(el)) {
          shown.add(el);
          entering.push(el);
        } else if (entry.intersectionRatio === 0 && shown.has(el)) {
          shown.delete(el);
          onLeave(el);
        }
      });
      if (entering.length) {
        entering.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
        onEnter(entering);
      }
    }, { threshold: [0, 0.2] });
    list.forEach(el => observer.observe(el));
  };

  /* ---------- 1. Sticky header state ----------
     Adds .is-scrolled once the page moves, which the CSS uses to
     show the frosted background. */
  const header = document.querySelector('.site-header');
  const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 20);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  /* ---------- 2. Code typing effect ----------
     Empties every code window that is showing, then types them out one after another (top to
     bottom), one character at a time, keeping the syntax colours. A single blinking cursor follows
     the typing. The first window has a full and a compact snippet, so only the visible one counts;
     the two extra windows only show on wide screens (1440px and over). Each extra window slides in
     as its turn begins. */
  const wideQuery = window.matchMedia('(min-width: 1440px)');   // wide screens use section 2b instead of typing
  const codeBlocks = Array.from(document.querySelectorAll('.code-card code')).filter(el => el.offsetParent !== null);
  const cardOf = block => block.closest('.code-card');

  // Windows that aren't showing right now (the extras on narrower screens) are marked ready, so they
  // simply appear if the window is later widened
  document.querySelectorAll('.code-card').forEach(card => {
    if (!codeBlocks.some(block => cardOf(block) === card)) card.classList.add('is-shown');
  });

  if (reduceMotion) {
    codeBlocks.forEach(block => cardOf(block).classList.add('is-shown'));   // no typing: show it all
  } else if (codeBlocks.length && !wideQuery.matches) {
    // Measure every block first so each keeps its full height once emptied (no layout jump)
    const heights = codeBlocks.map(block => block.parentElement.offsetHeight);

    // Collect and clear the text nodes of every block (empty nodes are skipped)
    const jobs = codeBlocks.map((block, i) => {
      block.parentElement.style.minHeight = heights[i] + 'px';
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      const parts = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.nodeValue.length) parts.push({ node, text: node.nodeValue });
        node.nodeValue = '';
      }
      return { card: cardOf(block), parts };
    }).filter(job => job.parts.length);

    // Blinking cursor that follows the typing
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    cursor.setAttribute('aria-hidden', 'true');

    // With three windows (wide screens) typing is a little faster so the whole stack finishes sooner
    const stacked = jobs.length > 1;
    const letterMs = stacked ? 12 : 24;     // delay after each letter
    const spaceMs = stacked ? 4 : 8;        // delay after a space or line break
    const windowPauseMs = stacked ? 150 : 350;   // pause before the next window starts
    const startPauseMs = stacked ? 100 : 400;    // pause between a window sliding in and its first letter

    let job = 0;    // which window we're typing
    let part = 0;   // which text node of it
    let char = 0;   // how many characters of that node are shown

    const type = () => {
      const { node, text } = jobs[job].parts[part];
      if (char === 0) node.after(cursor);            // move the cursor only when a new node starts
      char += 1;
      node.nodeValue = text.slice(0, char);
      const typed = text[char - 1];
      if (char >= text.length) { part += 1; char = 0; }

      if (part < jobs[job].parts.length) {
        setTimeout(type, /\s/.test(typed) ? spaceMs : letterMs);   // whitespace is quicker than letters
      } else if (job + 1 < jobs.length) {
        job += 1;                                      // this window is done: next one after a pause
        part = 0;
        setTimeout(startJob, windowPauseMs);
      }                                                // last window done: the cursor just blinks
    };

    const startJob = () => {
      jobs[job].card.classList.add('is-shown');        // slides the window in (extra windows)
      setTimeout(type, startPauseMs);
    };

    if (jobs.length) setTimeout(startJob, 700);        // short pause after page load
  }

  /* ---------- 2b. Code stack on wide screens (1440px and over) ----------
     The three code windows float inside the .code-stack area (which the CSS grows into the right-hand
     page margin). Each time the page loads they spawn at slightly random spots, stacked top to bottom and
     stepping to the right. A visitor can drag any window anywhere inside the area (it stays inside). Two
     glowing lines join window 1 to 2 and 2 to 3. They are drawn in an SVG underneath all the windows, so
     they can never cover code: with a gap between two windows the line runs from the lower edge of the
     upper one to the upper edge of the lower one, and with no gap it loops round the nearer side.
     Positions are kept until the page reloads. The entrance animation itself is all CSS (.is-live). */
  const codeStack = document.querySelector('.code-stack');
  const codeCards = codeStack ? Array.from(codeStack.querySelectorAll('.code-card')) : [];
  if (codeStack && codeCards.length === 3) {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const LINKS = [[0, 1], [1, 2]];                 // which windows each line joins
    const SPAWN = [                                  // where each window starts, as a fraction of its free room
      { x: 0.09, xr: 0.16, y: 0.05, yr: 0.07 },     // x / y = centre, xr / yr = random spread either way
      { x: 0.30, xr: 0.23, y: 0.46, yr: 0.10 },
      { x: 0.51, xr: 0.30, y: 0.87, yr: 0.10 }
    ];
    const pos = codeCards.map(() => ({ x: 0, y: 0 }));
    let lines = [];                                  // one {glow, core, flow} set of paths per link
    let svg = null;
    let ready = false;
    let drag = null;
    let topZ = 10;

    const rand = spread => (Math.random() * 2 - 1) * spread;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const maxX = i => Math.max(0, codeStack.clientWidth - codeCards[i].offsetWidth);
    const maxY = i => Math.max(0, codeStack.clientHeight - codeCards[i].offsetHeight);
    const rectOf = i => ({ x: pos[i].x, y: pos[i].y, w: codeCards[i].offsetWidth, h: codeCards[i].offsetHeight });

    // SVG path between two windows (always drawn under them)
    const linkPath = (a, b) => {
      const A = rectOf(a), B = rectOf(b);
      const [top, low] = A.y <= B.y ? [A, B] : [B, A];
      if (low.y - (top.y + top.h) >= 24) {           // a gap between them: lower edge to upper edge
        const x1 = top.x + top.w / 2, y1 = top.y + top.h;
        const x2 = low.x + low.w / 2, y2 = low.y;
        const d = Math.max(30, (y2 - y1) / 2);
        return `M${x1},${y1} C${x1},${y1 + d} ${x2},${y2 - d} ${x2},${y2}`;
      }
      const areaW = codeStack.clientWidth;               // overlapping: loop round the left or right side
      const left = Math.min(A.x, B.x) >= 70 || Math.max(A.x, B.x) + A.w + 70 > areaW;
      const edge = r => (left ? r.x : r.x + r.w);
      const bulge = left ? Math.max(-20, Math.min(A.x, B.x) - 70)
                         : Math.min(areaW - 8, Math.max(A.x, B.x) + A.w + 70);
      const y1 = A.y + A.h / 2, y2 = B.y + B.h / 2;
      return `M${edge(A)},${y1} C${bulge},${y1} ${bulge},${y2} ${edge(B)},${y2}`;
    };

    const draw = () => {
      codeCards.forEach((card, i) => { card.style.left = pos[i].x + 'px'; card.style.top = pos[i].y + 'px'; });
      if (!svg) return;
      LINKS.forEach(([a, b], n) => {
        const d = linkPath(a, b);
        Object.values(lines[n]).forEach(path => path.setAttribute('d', d));
      });
    };

    const buildLines = () => {
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'code-lines');
      svg.setAttribute('aria-hidden', 'true');
      // userSpaceOnUse: a perfectly straight line has no height or width, which would give a normal
      // filter region of zero size and no glow
      svg.innerHTML = '<defs><filter id="code-glow" filterUnits="userSpaceOnUse" x="-200" y="-200" ' +
                      'width="3000" height="3000"><feGaussianBlur stdDeviation="6"/></filter></defs>';
      lines = LINKS.map(() => {
        const set = {};
        ['glow', 'core', 'flow'].forEach(kind => {
          set[kind] = document.createElementNS(SVG_NS, 'path');
          set[kind].setAttribute('class', kind);
          svg.append(set[kind]);
        });
        return set;
      });
      codeStack.prepend(svg);                            // first child, so it sits under the windows
    };

    const bringToFront = i => {
      codeCards.forEach((card, j) => card.classList.toggle('is-front', j === i));
      topZ += 1;
      codeCards[i].style.zIndex = topZ;
    };

    const spawn = () => codeCards.forEach((card, i) => {
      const s = SPAWN[i];
      pos[i].x = clamp((s.x + rand(s.xr)) * maxX(i), 0, maxX(i));
      pos[i].y = clamp((s.y + rand(s.yr)) * maxY(i), 0, maxY(i));
      card.style.zIndex = i + 1;
    });

    // Dragging (mouse, pen or touch): pointer capture keeps the move events coming even if the pointer
    // slips off the window
    codeCards.forEach((card, i) => {
      card.addEventListener('pointerdown', e => {
        if (!ready || !wideQuery.matches || (e.pointerType === 'mouse' && e.button !== 0)) return;
        drag = { i, sx: e.clientX, sy: e.clientY, ox: pos[i].x, oy: pos[i].y };
        bringToFront(i);
        card.classList.add('is-dragging');
        card.setPointerCapture(e.pointerId);
        e.preventDefault();                          // no text selection while dragging
      });
      card.addEventListener('pointermove', e => {
        if (!drag || drag.i !== i) return;
        pos[i].x = clamp(drag.ox + e.clientX - drag.sx, 0, maxX(i));
        pos[i].y = clamp(drag.oy + e.clientY - drag.sy, 0, maxY(i));
        draw();
      });
      const endDrag = () => {
        if (!drag || drag.i !== i) return;
        drag = null;
        card.classList.remove('is-dragging');
      };
      card.addEventListener('pointerup', endDrag);
      card.addEventListener('pointercancel', endDrag);
    });

    const init = () => {
      if (ready || !wideQuery.matches) return;
      ready = true;
      buildLines();
      spawn();
      bringToFront(codeCards.length - 1);
      draw();
      requestAnimationFrame(() => codeStack.classList.add('is-live'));   // starts the CSS entrance
    };

    // Wait for the fonts so the windows are measured at their real size
    const fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve();
    fontsReady.then(init);
    wideQuery.addEventListener('change', init);      // the window was widened past 1440px after loading

    // Keep every window inside the area when the browser is resized
    window.addEventListener('resize', () => {
      if (!ready || !wideQuery.matches) return;
      codeCards.forEach((card, i) => {
        pos[i].x = clamp(pos[i].x, 0, maxX(i));
        pos[i].y = clamp(pos[i].y, 0, maxY(i));
      });
      draw();
    }, { passive: true });
  }

  /* ---------- 3. Work card reveal ----------
     Cards fade up when they scroll into view, and again each time they scroll back into view. Cards
     that arrive together are staggered in page order: --i is the card's place in that group (0, 1, 2 ...),
     so a card scrolling in on its own never waits behind the others. */
  const cards = document.querySelectorAll('.card');
  inView(
    cards,
    entering => entering.forEach((card, i) => {
      card.style.setProperty('--i', i);
      card.classList.add('is-visible');
    }),
    card => card.classList.remove('is-visible')
  );

  /* ---------- 3b. Cover takeover layer ----------
     Each card gets a decorative .card__takeover layer holding the full cover and a caption. The CSS
     (section 7, "Cover takeover") unfolds it over the card on hover. The cover is read from the
     background-image content.js already set on .card__image, so nothing else needs to change. */
  /* A card with little text is shorter than the hover layout needs: the unfolded cover, the title, the whole
     description and the tags band all have to fit. fitCard raises the card's min-height to exactly what that
     layout needs, so the band always sits below the bottom of the description. Cards that already have room
     keep their natural height, and nothing is changed while a card is hidden by the filter. */
  function fitCard(card) {
    const body = card.querySelector('.card__takeover-body');
    if (!body || !card.offsetWidth) return;
    const gap = body.querySelector('.card__takeover-gap');
    const title = body.querySelector('.card__takeover-title');
    const desc = body.querySelector('.card__takeover-desc');
    const foot = body.querySelector('.card__takeover-foot');
    if (!gap || !title || !desc || !foot) return;
    const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;
    const need = gap.offsetHeight + px(gap, 'marginBottom')
      + title.offsetHeight
      + px(desc, 'marginTop') + desc.scrollHeight
      + foot.offsetHeight
      + px(body, 'paddingBottom')
      + (card.offsetHeight - card.clientHeight);          // the card's own border
    card.style.minHeight = Math.ceil(need) + 'px';
  }

  cards.forEach(card => {
    const thumb = card.querySelector('.card__image');
    const link = card.querySelector('.card__link');
    if (!thumb || !link || card.querySelector('.card__takeover')) return;

    const layer = document.createElement('div');
    layer.className = 'card__takeover';
    layer.setAttribute('aria-hidden', 'true');

    const match = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(thumb.style.backgroundImage || '');
    if (match) {
      const img = document.createElement('img');
      img.src = match[1];
      img.alt = '';
      img.decoding = 'async';
      // The title is placed right under the unfolded cover, so the CSS needs the cover's real shape
      const setRatio = () => {
        if (img.naturalWidth && img.naturalHeight) layer.style.setProperty('--cover-ratio', img.naturalWidth / img.naturalHeight);
        fitCard(card);                                    // the cover's shape decides how tall the spacer is
      };
      img.addEventListener('load', setRatio);
      if (img.complete) setRatio();
      layer.append(img);
    } else {
      layer.classList.add('card__takeover--empty');   // no cover yet: placeholder grey
    }

    // Text below the cover, copied from the card itself: a spacer as tall as the cover, then the title and
    // the full description right under the image, then the tags with a "View" cue on the right, anchored
    // to the bottom of the card. A tag is green only while its stack pill is selected (applyFilter,
    // section 5, switches that on).
    const body = document.createElement('div');
    body.className = 'card__takeover-body';

    const title = document.createElement('div');
    title.className = 'card__takeover-title';
    title.textContent = link.textContent;

    const desc = document.createElement('div');
    desc.className = 'card__takeover-desc';
    desc.textContent = (card.querySelector('p:not(.card__cta)') || {}).textContent || '';

    const tagList = document.createElement('ul');
    tagList.className = 'card__takeover-tags';
    Array.from(card.querySelectorAll('.card__tags li')).slice(0, 3).forEach(tag => {
      const li = document.createElement('li');
      li.textContent = tag.textContent;
      tagList.append(li);
    });

    const cta = document.createElement('span');
    cta.className = 'card__takeover-cta';
    const arrow = document.createElement('span');
    arrow.textContent = '\u2192';
    cta.append('View ', arrow);

    const foot = document.createElement('div');
    foot.className = 'card__takeover-foot';
    foot.append(tagList, cta);

    const gap = document.createElement('div');
    gap.className = 'card__takeover-gap';

    body.append(gap, title, desc, foot);
    layer.append(body);

    card.append(layer);
  });

  // Fit every card now, again once the fonts have loaded (they change the text height), and whenever a
  // card's width changes: a window resize, or the filter showing a card that was hidden.
  cards.forEach(fitCard);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => cards.forEach(fitCard));
  if ('ResizeObserver' in window) {
    const widths = new WeakMap();
    const watch = new ResizeObserver(entries => entries.forEach(e => {
      const w = Math.round(e.contentRect.width);
      if (widths.get(e.target) !== w) { widths.set(e.target, w); fitCard(e.target); }
    }));
    cards.forEach(card => watch.observe(card));
  } else {
    window.addEventListener('resize', () => cards.forEach(fitCard));
  }

  /* ---------- 3c. Skill pill entrance ----------
     The pills rise and fade in, staggered by position, each time the Stack section scrolls into view
     (the CSS hides them only when JS is running). */
  const pillList = document.querySelector('.pills');
  if (pillList) {
    pillList.querySelectorAll('li').forEach((li, i) => li.style.setProperty('--i', i));
    inView(
      [pillList],
      els => els.forEach(el => el.classList.add('is-visible')),
      el => el.classList.remove('is-visible')
    );
  }

  /* ---------- 3d. Contact entrance ----------
     The label, intro line, links, form panel and fields play their entrance sequence (CSS section 9b)
     each time the Contact section scrolls into view. */
  inView(
    document.querySelectorAll('.contact'),
    els => els.forEach(el => el.classList.add('is-visible')),
    el => el.classList.remove('is-visible')
  );

  /* ---------- 3e. Hero entrance ----------
     The hero text rises and fades in one LINE at a time (CSS section 9b), once, when the hero first comes
     into view. The headline and the summary are wrapped by the browser, so splitLines measures where the lines
     break at the current width, then puts each line in its own block so it can animate on its own. It runs
     again when the width changes or the fonts load, and only rebuilds when the breaks actually move. The
     text is never altered, only the way it is split, so screen readers still read it as one sentence. */
  const heroText = document.querySelector('.hero__text');
  if (heroText) {
    // Measures where a block of text wraps, using a hidden copy so the real element is left alone
    const measureLines = (el, text) => {
      const probe = el.cloneNode(false);
      probe.removeAttribute('id');
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;max-width:none;width:' +
        el.getBoundingClientRect().width + 'px';
      const spans = text.split(' ').map((word, i, all) => {
        const s = document.createElement('span');
        s.textContent = word;
        probe.append(s);
        if (i < all.length - 1) probe.append(' ');
        return s;
      });
      el.after(probe);
      const lines = [];
      let top = null;
      spans.forEach(s => {
        if (top === null || Math.abs(s.offsetTop - top) > 2) { lines.push([]); top = s.offsetTop; }
        lines[lines.length - 1].push(s.textContent);
      });
      probe.remove();
      return lines.map(words => words.join(' '));
    };

    // Splits one element into line blocks; returns its list of lines (rebuilt only if the breaks changed)
    const splitLines = el => {
      const text = (el.dataset.text = el.dataset.text || el.textContent.trim().replace(/\s+/g, ' '));
      const lines = measureLines(el, text);
      const key = lines.join('|');
      if (el.dataset.lines !== key) {
        el.dataset.lines = key;
        el.textContent = '';
        lines.forEach((line, i) => {
          const block = document.createElement('span');
          block.className = 'hero-line hr';
          block.textContent = line;
          el.append(block);
          if (i < lines.length - 1) el.append(' ');
        });
        return { lines: el.querySelectorAll('.hero-line'), changed: true };
      }
      return { lines: el.querySelectorAll('.hero-line'), changed: false };
    };

    const heroLines = () => {
      const h1 = heroText.querySelector('h1');
      const summary = heroText.querySelector('.hero__summary');
      const a = h1 ? splitLines(h1) : { lines: [], changed: false };
      const b = summary ? splitLines(summary) : { lines: [], changed: false };

      // Everything that rises, in reading order, with its delay (about 1.3s end to end at three lines each)
      let delay = 0;
      const rise = (els, step) => els.forEach(el => { el.classList.add('hr'); el.style.setProperty('--d', delay.toFixed(2) + 's'); delay += step; });
      const tagline = heroText.querySelector('.hero__tagline');
      if (tagline) rise([tagline], 0);
      delay = 0.1;
      rise(a.lines, 0.1);
      delay += 0.05;
      rise(b.lines, 0.08);
      delay += 0.04;
      rise(heroText.querySelectorAll('.hero__actions .btn'), 0.08);
      rise(heroText.querySelectorAll('.social'), 0.08);
      return a.changed || b.changed;
    };

    heroLines();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (heroLines()) heroText.classList.add('is-settled'); });
    }
    // A width change can move the line breaks: re-split without replaying the entrance
    let heroWidth = heroText.getBoundingClientRect().width;
    let heroFrame = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(heroFrame);
      heroFrame = requestAnimationFrame(() => {
        const w = heroText.getBoundingClientRect().width;
        if (Math.abs(w - heroWidth) < 1) return;
        heroWidth = w;
        if (heroLines()) heroText.classList.add('is-settled');
      });
    });

    inView(
      [heroText],
      els => els.forEach(el => el.classList.add('is-visible')),
      () => {}                                   // plays once: scrolling back up does not replay it
    );
  }

  /* ---------- 4. Active nav link ----------
     Highlights the nav item for the section whose top has passed a line
     35% down the screen. Scroll-based rather than observer-based so the short
     Stack section still gets its turn. Nothing is highlighted while the hero is
     in view, and the last section (About) stays lit once the page reaches the bottom. */
  const links = document.querySelectorAll('.nav a[href^="#"]');   // in-page links only (other pages' links are left alone)
  const spySections = ['stack', 'work', 'contact', 'about']      // in page order
    .map(id => document.getElementById(id))
    .filter(Boolean);
  let spyQueued = false;

  const updateSpy = () => {
    spyQueued = false;
    const line = window.innerHeight * 0.35;
    let current = null;                                          // null = hero / top of page
    spySections.forEach(section => {
      if (section.getBoundingClientRect().top <= line) current = section.id;
    });
    const atBottom = spySections.length > 0 && window.scrollY > 0 &&
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom) current = spySections[spySections.length - 1].id;

    links.forEach(link => {
      if (current && link.getAttribute('href') === '#' + current) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  // Run at most once per frame while scrolling
  window.addEventListener('scroll', () => {
    if (!spyQueued) { spyQueued = true; requestAnimationFrame(updateSpy); }
  }, { passive: true });
  updateSpy();

  /* ---------- 5. Stack pill toggles and project filtering ----------
     Clicking a pill selects or unselects it; any number can be selected.
     Filter rule: with nothing selected every project shows. Otherwise a project
     shows if ANY of its tags (max 3, read from .card__tags) matches ANY selected pill. */
  const selectedStack = new Set();
  const status = document.querySelector('.work__status') || { textContent: '' };   // projects.html has no filter line

  // The tag elements of a card (only the first 3 count)
  const tagsOf = card => Array.from(card.querySelectorAll('.card__tags li')).slice(0, 3);

  // On mobile (600px and narrower) at most 3 projects are shown, even if more match
  const MOBILE_MAX_PROJECTS = 3;
  const mobileQuery = window.matchMedia('(max-width: 600px)');

  const applyFilter = () => {
    const limit = mobileQuery.matches ? MOBILE_MAX_PROJECTS : Infinity;
    let matched = 0;   // cards that match the selected pills
    let shown = 0;     // cards actually displayed (matched, up to the limit)
    cards.forEach(card => {
      const tags = tagsOf(card);
      const matches = selectedStack.size === 0 ||
        tags.some(tag => selectedStack.has(tag.dataset.tech));
      if (matches) matched += 1;
      const visible = matches && shown < limit;
      card.hidden = !visible;                         // hidden cards drop out of the grid
      if (visible) shown += 1;
      tags.forEach(tag => tag.classList.toggle('is-match', selectedStack.has(tag.dataset.tech)));

      // The tags shown on hover (section 3b) copy the card's tags in the same order, so they light up
      // green only when the matching tag on the card is lit, i.e. its stack pill is selected
      const hoverTags = card.querySelectorAll('.card__takeover-tags li');
      tags.forEach((tag, i) => {
        if (hoverTags[i]) hoverTags[i].classList.toggle('is-on', selectedStack.has(tag.dataset.tech));
      });
    });

    // Status line: empty (hidden) unless filtering or limited, otherwise a count or a "none" message
    if (matched === 0) {
      status.textContent = 'No projects match the selected tags.';
    } else if (shown < matched) {
      status.textContent = `Showing the first ${shown} of ${matched} projects`;   // mobile limit
    } else if (selectedStack.size > 0) {
      status.textContent = `Showing ${shown} of ${cards.length} projects`;
    } else {
      status.textContent = '';
    }
  };

  applyFilter();                                      // apply the mobile limit on load
  mobileQuery.addEventListener('change', applyFilter);   // and when the screen size crosses 600px

  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const isOn = pill.getAttribute('aria-pressed') !== 'true';
      pill.setAttribute('aria-pressed', String(isOn));   // drives the CSS and screen readers
      if (isOn) selectedStack.add(pill.dataset.tech);
      else selectedStack.delete(pill.dataset.tech);
      applyFilter();
    });
  });

  /* ---------- 6. Contact form ----------
     On submit the form is sent as JSON to /api/contact (src/worker.js). The server filters out
     fake addresses and spam, saves the message in the D1 database and emails an alert.
     Native validation (required fields, valid email, length) runs first. Two things are sent to help
     the filter: the hidden "website" honeypot (empty for real visitors) and "elapsed", the time in ms
     from first clicking into the form to sending it (bots fill forms in instantly).
     If the server rejects the message (bad email, too many messages) its reason is shown; if sending
     fails for any other reason, the status line points visitors to the email address instead. */
  const form = document.querySelector('.contact-form');
  if (form) {
    const formStatus = form.querySelector('.form__status');
    const submitBtn = form.querySelector('button[type="submit"]');

    // Character counter in the Message label ("0 / 5000"), updated as the visitor types and after a reset
    const messageBox = form.querySelector('textarea[name="message"]');
    const counter = form.querySelector('.field__count');
    if (messageBox && counter) {
      const limit = messageBox.maxLength > 0 ? messageBox.maxLength : 5000;
      const updateCount = () => { counter.textContent = `${messageBox.value.length} / ${limit}`; };
      messageBox.addEventListener('input', updateCount);
      form.addEventListener('reset', () => setTimeout(updateCount));   // after the reset has cleared the box
      updateCount();
    }

    let startedAt = null;                       // set when the visitor first clicks into the form
    form.addEventListener('focusin', () => { if (!startedAt) startedAt = Date.now(); });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);

      submitBtn.disabled = true;               // stops double submissions
      formStatus.textContent = 'Sending…';

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: String(data.get('name')).trim(),
            email: String(data.get('email')).trim(),
            message: String(data.get('message')).trim(),
            website: String(data.get('website') || ''),            // honeypot
            elapsed: startedAt ? Date.now() - startedAt : 0
          })
        });
        const result = await res.json().catch(() => ({}));

        if (res.ok) {
          form.reset();
          startedAt = null;
          formStatus.textContent = 'Thanks! Your message has been sent.';
        } else if ((res.status === 400 || res.status === 429) && result.error) {
          formStatus.textContent = result.error;                    // e.g. "That email address doesn't look valid."
        } else {
          throw new Error('Request failed');
        }
      } catch {
        formStatus.textContent = `Something went wrong. Please email ${form.dataset.email} directly.`;
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  /* ---------- 7. Lava lamp background ----------
     Two canvases (the left and right page margins, see .lava in the CSS) each run their own
     "lamp": a small physics simulation drawn as metaballs.
     - Blobs heat up near the bottom (turning coral) and rise, then cool near the top
       (turning mint) and sink, so each one cycles up and down at its own pace.
     - Two big wax pools at the bottom sway side by side; rising blobs stretch away from
       them and sinking blobs merge back in.
     - Where blobs get close their fields add together, so they join and split like real wax.
     The picture is drawn at a quarter of the screen resolution and scaled up, which keeps
     it cheap and soft. Colours come from the --lava-* variables in the CSS.
     At 1440px and narrower (phones, tablets, small laptops) the page margins are too small, so the
     left canvas fills the whole screen (CSS section 10) and that lamp switches to a full-screen
     mode with more, larger blobs spread across the width. The right canvas is then switched off.
     With reduced motion the lamp is simulated for a few seconds and drawn once, still. */
  const lavaCanvases = document.querySelectorAll('.lava__canvas');
  if (lavaCanvases.length) {
    const css = getComputedStyle(document.documentElement);
    const readRgb = (name, fallback) => (css.getPropertyValue(name).trim() || fallback).split(',').map(Number);
    const GREEN = readRgb('--lava-green', '95, 205, 150');
    const MINT  = readRgb('--lava-mint',  '160, 235, 195');
    const CORAL = readRgb('--lava-coral', '232, 128, 108');

    const SCALE = 4;                                    // screen pixels per drawn pixel (raise for speed)
    const clamp01 = v => Math.min(1, Math.max(0, v));
    const mix = (a, b, t) => a + (b - a) * t;
    const smooth = (edge0, edge1, x) => {               // smooth 0 to 1 ramp between two values
      const t = clamp01((x - edge0) / (edge1 - edge0));
      return t * t * (3 - 2 * t);
    };

    // Temperature 0 to 1 becomes a colour: mint (cool) -> green -> coral (hot)
    const heatColour = (t, out) => {
      const from = t < 0.5 ? MINT : GREEN;
      const to   = t < 0.5 ? GREEN : CORAL;
      const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      out[0] = mix(from[0], to[0], k);
      out[1] = mix(from[1], to[1], k);
      out[2] = mix(from[2], to[2], k);
    };

    class Lamp {
      constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.time = Math.random() * 100;                // so the two lamps never match
        this.blobs = [];
        this.w = 0;                                     // margin size in screen pixels
        this.h = 0;
        this.colour = [0, 0, 0];
        this.full = false;                              // true when this canvas covers the whole screen (mobile)
        this.resize();
      }

      // Match the drawing size to the margin; keep blobs in proportion when the window changes
      resize() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        if (w === this.w && h === this.h) return;
        const sx = this.w ? w / this.w : 1;
        const sy = this.h ? h / this.h : 1;
        const full = w > 0 && w >= document.documentElement.clientWidth - 1;
        const modeChanged = full !== this.full;         // margin <-> full screen: start the blobs over
        this.full = full;
        this.w = w;
        this.h = h;
        this.cols = Math.max(1, Math.ceil(w / SCALE));
        this.rows = Math.max(1, Math.ceil(h / SCALE));
        this.canvas.width = this.cols;
        this.canvas.height = this.rows;
        this.image = this.ctx.createImageData(this.cols, this.rows);
        if (!w || !h) return;                           // margin is hidden: nothing to draw
        if (this.blobs.length && !modeChanged) {
          this.blobs.forEach(b => { b.y *= sy; b.vy *= sy; });
        } else {
          this.populate();
        }
      }

      // Create the pools and the free-floating blobs
      populate() {
        const { w, h, full } = this;
        this.blobs = [];
        // Two wax pools at the bottom edge (they sway but never leave)
        [0.25, 0.75].forEach(side => this.blobs.push({
          pool: true, cx: side, f: full ? 0.3 : 0.42, y: h, ph: Math.random() * 6.28, t: 0.9, sy: 1
        }));
        // Free blobs: more on taller screens, and more and larger when covering the whole screen
        const count = full
          ? Math.min(4, Math.max(3, Math.round(h / 260)))
          : Math.min(5, Math.max(3, Math.round(h / 270)));
        const big = full ? 1.05 : 1;
        for (let i = 0; i < count; i++) {
          this.blobs.push({
            pool: false,
            cx: full ? 0.15 + Math.random() * 0.7 : 0.3 + Math.random() * 0.4,   // where it sways around (fraction of the width)
            x: w / 2,
            y: Math.random() * h,
            vy: 0,
            f: (0.11 + Math.random() * 0.11) * big,      // size as a fraction of the width
            t: Math.random(),                           // temperature
            k: 0.6 + Math.random() * 0.8,               // how strongly heat moves it (lighter = faster)
            fx: 0.25 + Math.random() * 0.4,             // sway speed
            ph: Math.random() * 6.28,                   // sway offset
            sy: 1                                       // vertical stretch
          });
        }
      }

      radius(b) {
        return b.pool ? Math.max(60, this.w * b.f) : Math.max(28, this.w * b.f);
      }

      // Move everything on by dt seconds
      step(dt) {
        const { w, h } = this;
        this.time += dt;
        const time = this.time;
        this.blobs.forEach(b => {
          const r = this.radius(b);
          if (b.pool) {                                 // pools slosh slowly
            b.x = w * (b.cx + Math.sin(time * 0.35 + b.ph) * 0.18);
            b.y = h + r * 0.2 + Math.sin(time * 0.5 + b.ph) * r * 0.18;
            return;
          }
          // Heat up near the bottom, cool near the top, drift cooler in between
          const rel = b.y / h;
          if (rel > 0.8) b.t += 0.35 * dt;
          else if (rel < 0.2) b.t -= 0.4 * dt;
          else b.t -= 0.02 * dt;
          b.t = clamp01(b.t);

          // Warm blobs rise (up is negative y), cool blobs sink; damping caps the speed
          const lift = (0.5 - b.t) * h * 0.15 * b.k + Math.sin(time * 0.7 + b.ph * 3) * h * 0.01;
          b.vy = (b.vy + lift * dt) * Math.exp(-1.2 * dt);
          b.y += b.vy * dt;
          const top = r * 0.4;
          const bottom = h + r * 0.2;
          if (b.y < top) { b.y = top; b.vy = 0; }
          if (b.y > bottom) { b.y = bottom; b.vy = 0; }

          b.x = w * b.cx + Math.sin(time * b.fx + b.ph) * w * 0.22;   // side to side sway
          b.sy = 1 + Math.min(0.5, Math.abs(b.vy) / 100);              // stretch while moving fast
        });
      }

      // Draw the combined field of every blob
      render() {
        const { cols, rows, blobs } = this;
        const n = blobs.length;
        const data = this.image.data;
        const bx = new Float32Array(n), by = new Float32Array(n), r2 = new Float32Array(n);
        const isy = new Float32Array(n), cr = new Float32Array(n), cg = new Float32Array(n), cb = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const b = blobs[i];
          const r = this.radius(b) / SCALE;
          bx[i] = b.x / SCALE;
          by[i] = b.y / SCALE;
          r2[i] = r * r;
          isy[i] = 1 / b.sy;
          heatColour(b.t, this.colour);
          cr[i] = this.colour[0]; cg[i] = this.colour[1]; cb[i] = this.colour[2];
        }

        let p = 0;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            let f = 0, sr = 0, sg = 0, sb = 0;
            for (let i = 0; i < n; i++) {
              const dx = x + 0.5 - bx[i];
              const dy = (y + 0.5 - by[i]) * isy[i];
              const c = r2[i] / (dx * dx + dy * dy + 0.5);   // each blob's pull on this pixel
              f += c;
              sr += c * cr[i]; sg += c * cg[i]; sb += c * cb[i];
            }
            const body = smooth(0.9, 1.2, f);                 // solid wax where the field is strong
            const glow = smooth(0.25, 1.0, f) * 0.35;         // soft halo around it
            const alpha = Math.max(body * 0.95, glow);
            const light = smooth(1.3, 3, f) * 0.3;            // brighter core where blobs overlap
            const inv = 1 / (f + 1e-6);
            const r = sr * inv, g = sg * inv, bl = sb * inv;
            data[p++] = r + (255 - r) * light;
            data[p++] = g + (255 - g) * light;
            data[p++] = bl + (255 - bl) * light;
            data[p++] = alpha * 255;
          }
        }
        this.ctx.putImageData(this.image, 0, 0);
      }
    }

    const lamps = Array.from(lavaCanvases).map(canvas => new Lamp(canvas));

    if (reduceMotion) {
      // Still picture: let the wax settle for a few seconds, draw once, redraw on resize
      const drawStill = () => lamps.forEach(lamp => {
        lamp.resize();
        if (lamp.w) {
          for (let i = 0; i < 120; i++) lamp.step(0.05);
          lamp.render();
        }
      });
      drawStill();
      window.addEventListener('resize', drawStill);
    } else {
      // Animate at about 30 frames a second (slow-moving wax doesn't need more)
      let last = performance.now();
      const frame = now => {
        requestAnimationFrame(frame);
        const elapsed = now - last;
        if (elapsed < 32) return;
        last = now;
        const dt = Math.min(0.1, elapsed / 1000);
        lamps.forEach(lamp => {
          lamp.resize();                               // cheap check, handles window resizes
          if (lamp.w) { lamp.step(dt); lamp.render(); }
        });
      };
      requestAnimationFrame(frame);
    }
  }
})();