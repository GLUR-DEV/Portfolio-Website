/* ==========================================================
   Portfolio landing page – JavaScript (motion)
   1. Sticky header state   2. Code typing effect (one window, three stacked on wide screens)
   3. Work card reveal      4. Active nav link
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
  const codeBlocks = Array.from(document.querySelectorAll('.code-card code')).filter(el => el.offsetParent !== null);
  const cardOf = block => block.closest('.code-card');

  // Windows that aren't showing right now (the extras on narrower screens) are marked ready, so they
  // simply appear if the window is later widened
  document.querySelectorAll('.code-card').forEach(card => {
    if (!codeBlocks.some(block => cardOf(block) === card)) card.classList.add('is-shown');
  });

  if (reduceMotion) {
    codeBlocks.forEach(block => cardOf(block).classList.add('is-shown'));   // no typing: show it all
  } else if (codeBlocks.length) {
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

  /* ---------- 3. Work card reveal ----------
     Cards fade up when they scroll into view, staggered by position. */
  const cards = document.querySelectorAll('.card');
  cards.forEach((card, i) => card.style.setProperty('--i', i));
  if (reduceMotion || !('IntersectionObserver' in window)) {
    cards.forEach(card => card.classList.add('is-visible'));
  } else {
    const reveal = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);               // only animate once
        }
      });
    }, { threshold: 0.2 });
    cards.forEach(card => reveal.observe(card));
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
     On submit the form is sent as JSON to /api/contact. That is a Cloudflare Pages Function
     (functions/api/contact.js) which checks the message and saves it in the D1 database.
     Native validation (required fields, valid email) runs first. The hidden "website" field is a
     honeypot for bots; a real visitor never fills it in. If sending fails, the status line points
     visitors to the email address so no message is lost. */
  const form = document.querySelector('.contact-form');
  if (form) {
    const formStatus = form.querySelector('.form__status');
    const submitBtn = form.querySelector('button[type="submit"]');
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
            website: String(data.get('website') || '')   // honeypot (empty for real visitors)
          })
        });
        if (!res.ok) throw new Error('Request failed');
        form.reset();
        formStatus.textContent = 'Thanks! Your message has been sent.';
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
