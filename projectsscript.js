/* ==========================================================
   Project page – JavaScript (project picker, slideshows, enlarged view)
   Sections:
   1. Project picker – shows only the project named in the address
   2. Enlarged view  – click a slideshow picture to see it bigger
   3. Slideshows     – arrows, stage buttons, keys, swipe, automatic movement
   Header, lava lamp and everything else shared with index.html live in indexscript.js.
   ========================================================== */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Small inline icons for the buttons this script adds */
  const svg = inner => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ICON = {
    pause:  svg('<path d="M8 5v14M16 5v14"/>'),
    play:   svg('<path d="M7 5l12 7-12 7z" fill="currentColor"/>'),
    expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    close:  svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  };

  /* ---------- 1. Project picker ----------
     The page holds one section per project, but only the one named in the address is shown
     (projects.html?project=one, =two ... as linked from the cards on index.html). With no or an
     unknown name the first project is shown. */
  const projects = Array.from(document.querySelectorAll('.project'));
  if (projects.length) {
    const wanted = new URLSearchParams(window.location.search).get('project');
    const current = projects.find(p => p.dataset.project === wanted) || projects[0];
    projects.forEach(p => { p.hidden = p !== current; });
    document.title = `${current.dataset.title} | GLUR Solutions`;
  }

  /* ---------- 2. Enlarged view ----------
     One shared overlay, built the first time it is needed. The picture grows from the spot it was
     clicked and shrinks back when closed. Esc, a click on the backdrop or the picture, or the
     close button all close it; the arrows (or arrow keys) move through the same slideshow. */
  const lightbox = (() => {
    let root, backdrop, pic, bar, caption, nav, count, closeBtn, prevBtn, nextBtn;
    let ctrl = null, trigger = null, busy = false;
    const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
    const hideFromPage = on =>
      document.querySelectorAll('.skip-link, .site-header, main, .site-footer').forEach(el => { el.inert = on; });
    const inView = r => r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    // Where the picture should shrink back to: the slide image that is now showing
    const origin = () => ctrl && ctrl.slides[ctrl.index()].querySelector('.slide__image');

    const build = () => {
      if (root) return;
      root = document.createElement('div');
      root.className = 'lightbox';
      root.hidden = true;
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Enlarged picture');
      root.innerHTML = `
        <div class="lightbox__backdrop"></div>
        <button type="button" class="arrow lightbox__close" aria-label="Close enlarged picture">${ICON.close}</button>
        <div class="lightbox__panel">
          <div class="lightbox__pic"></div>
          <div class="lightbox__bar">
            <div class="lightbox__caption"></div>
            <div class="lightbox__nav">
              <button type="button" class="arrow" data-dir="-1" aria-label="Previous picture">&larr;</button>
              <p class="slideshow__count" aria-live="polite"></p>
              <button type="button" class="arrow" data-dir="1" aria-label="Next picture">&rarr;</button>
            </div>
          </div>
        </div>`;
      document.body.append(root);
      backdrop = root.querySelector('.lightbox__backdrop');
      pic = root.querySelector('.lightbox__pic');
      bar = root.querySelector('.lightbox__bar');
      caption = root.querySelector('.lightbox__caption');
      nav = root.querySelector('.lightbox__nav');
      count = root.querySelector('.slideshow__count');
      closeBtn = root.querySelector('.lightbox__close');
      [prevBtn, nextBtn] = root.querySelectorAll('.lightbox__nav .arrow');

      backdrop.addEventListener('click', () => close());
      pic.addEventListener('click', () => close());
      closeBtn.addEventListener('click', () => close());
      [prevBtn, nextBtn].forEach(btn => btn.addEventListener('click', () => step(Number(btn.dataset.dir))));
      root.addEventListener('keydown', event => {
        if (event.key === 'Escape') { close(); event.preventDefault(); }
        else if (event.key === 'ArrowRight') { step(1); event.preventDefault(); }
        else if (event.key === 'ArrowLeft') { step(-1); event.preventDefault(); }
        else if (event.key === 'Tab') {                       // keep Tab inside the overlay
          const stops = [closeBtn, prevBtn, nextBtn];
          const i = stops.indexOf(document.activeElement);
          const next = event.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : (i + 1) % stops.length;
          stops[next].focus();
          event.preventDefault();
        }
      });
    };

    // Copy the current slide's picture and caption into the overlay
    const fill = () => {
      const slide = ctrl.slides[ctrl.index()];
      pic.replaceChildren(slide.querySelector('.slide__image').cloneNode(true));
      caption.replaceChildren(slide.querySelector('.slide__caption').cloneNode(true));
      count.textContent = `${ctrl.index() + 1} / ${ctrl.slides.length}`;
    };

    const open = (controller, fromEl) => {
      if (ctrl || busy) return;
      build();
      ctrl = controller;
      trigger = document.activeElement;
      ctrl.setLightbox(true);
      fill();
      root.hidden = false;
      document.documentElement.classList.add('lb-open');
      hideFromPage(true);
      closeBtn.focus();
      if (!reduceMotion.matches && fromEl) {
        const from = fromEl.getBoundingClientRect();
        const to = pic.firstElementChild.getBoundingClientRect();
        backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
        // Grow the picture from where it was clicked to its enlarged position
        pic.animate([
          { transformOrigin: 'top left', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` },
          { transformOrigin: 'top left', transform: 'none' }
        ], { duration: 380, easing: EASE });
        [bar, closeBtn].forEach(el => el.animate(
          [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
          { duration: 300, delay: 180, easing: 'ease-out', fill: 'backwards' }));
      }
    };

    const close = async () => {
      if (!ctrl || busy) return;
      busy = true;
      const target = origin();
      if (!reduceMotion.matches && target && inView(target.getBoundingClientRect())) {
        const from = target.getBoundingClientRect();
        const to = pic.firstElementChild.getBoundingClientRect();
        const back = pic.animate([
          { transformOrigin: 'top left', transform: 'none' },
          { transformOrigin: 'top left', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` }
        ], { duration: 320, easing: EASE, fill: 'forwards' });
        backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
        [bar, closeBtn].forEach(el => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }));
        try { await back.finished; } catch (e) { /* animation cancelled: carry on */ }
      }
      root.getAnimations({ subtree: true }).forEach(a => a.cancel());
      root.hidden = true;
      document.documentElement.classList.remove('lb-open');
      hideFromPage(false);
      const done = ctrl;
      ctrl = null;
      done.setLightbox(false);
      if (trigger && document.contains(trigger)) trigger.focus();
      busy = false;
    };

    // Previous / next while enlarged: moves the slideshow underneath too
    const step = dir => {
      if (!ctrl) return;
      ctrl.go(ctrl.index() + dir);
      fill();
      if (!reduceMotion.matches) pic.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
    };

    return { open };
  })();

  /* ---------- 3. Slideshows ----------
     Turns every [data-slideshow] into a slideshow with:
     - previous / next arrows (they loop round) and stage buttons that jump to a picture
     - left / right arrow keys while the slideshow is focused, and swipe on touch screens
     - automatic movement every 5 seconds (the delay is --autoplay in projectsstyles.css). Every
       slideshow starts as soon as the page loads, wherever it sits on the page. It pauses only while
       the mouse is over the slideshow, while a keyboard user is focused in it, while the tab is
       hidden, while a picture is enlarged, and when the visitor presses the pause button. It never
       starts for people who prefer reduced motion.
     - a pause button and an enlarge button over the picture; clicking the picture also enlarges it
     Slides that are off screen are hidden from screen readers. */
  document.querySelectorAll('[data-slideshow]').forEach(show => {
    const viewport = show.querySelector('.slideshow__viewport');
    const track = show.querySelector('.slideshow__track');
    const slides = Array.from(show.querySelectorAll('.slide'));
    const steps = Array.from(show.querySelectorAll('.step'));
    const count = show.querySelector('.slideshow__count');
    if (!viewport || !track || slides.length < 2) return;

    let index = 0;

    /* Buttons over the picture, and the bar that counts down to the next slide */
    const tools = document.createElement('div');
    tools.className = 'slideshow__tools';
    tools.innerHTML = `
      <button type="button" class="slideshow__tool slideshow__play" aria-label="Pause automatic slideshow">${ICON.pause}</button>
      <button type="button" class="slideshow__tool slideshow__enlarge" aria-label="Enlarge this picture">${ICON.expand}</button>`;
    const playBtn = tools.querySelector('.slideshow__play');
    const enlargeBtn = tools.querySelector('.slideshow__enlarge');
    const bar = document.createElement('div');
    bar.className = 'slideshow__progress';
    bar.setAttribute('aria-hidden', 'true');
    viewport.append(tools, bar);

    /* Automatic movement. The bar animation runs for the delay; when it ends the slideshow moves on.
       Pausing the animation pauses the slideshow, and it carries on from where it stopped. */
    const hold = { user: false, hover: false, keyboard: false, lightbox: false };
    let pendingAdvance = false;
    const running = () =>
      !reduceMotion.matches && !document.hidden && !Object.values(hold).some(Boolean);

    const syncPlayState = () => {
      const on = running();
      bar.style.animationPlayState = on ? 'running' : 'paused';
      // Announce slide changes politely only when they are not happening automatically
      if (count) count.setAttribute('aria-live', on ? 'off' : 'polite');
      if (on && pendingAdvance) { pendingAdvance = false; go(index + 1); }
    };
    const restartBar = () => {
      bar.style.animation = 'none';
      void bar.offsetWidth;                                       // lets the browser restart the animation
      bar.style.animation = '';
      syncPlayState();
    };
    bar.addEventListener('animationend', () => {
      if (running()) go(index + 1);
      else pendingAdvance = true;                                 // moves on as soon as it is allowed to
    });

    const go = next => {
      index = (next + slides.length) % slides.length;             // wrap round at either end
      track.style.transform = `translateX(${-100 * index}%)`;
      slides.forEach((slide, i) => slide.setAttribute('aria-hidden', String(i !== index)));
      steps.forEach((step, i) => {
        if (i === index) step.setAttribute('aria-current', 'true');
        else step.removeAttribute('aria-current');
      });
      if (count) count.textContent = `${index + 1} / ${slides.length}`;
      pendingAdvance = false;
      restartBar();                                               // every change starts a fresh 5 seconds
    };

    // Arrows and stage buttons
    show.querySelectorAll('.arrow').forEach(btn =>
      btn.addEventListener('click', () => go(index + Number(btn.dataset.dir))));
    steps.forEach((step, i) => step.addEventListener('click', () => go(i)));

    // Pause / play button
    playBtn.addEventListener('click', () => {
      hold.user = !hold.user;
      playBtn.innerHTML = hold.user ? ICON.play : ICON.pause;
      playBtn.setAttribute('aria-label', hold.user ? 'Play automatic slideshow' : 'Pause automatic slideshow');
      syncPlayState();
    });

    // Pause rules: mouse over, keyboard focus, hidden tab, enlarged view (scroll position doesn't matter)
    show.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hold.hover = true; syncPlayState(); } });
    show.addEventListener('pointerleave', () => { hold.hover = false; syncPlayState(); });
    show.addEventListener('focusin', event => {                   // only keyboard focus pauses, not a mouse click
      if (event.target.matches(':focus-visible')) { hold.keyboard = true; syncPlayState(); }
    });
    show.addEventListener('focusout', event => {
      if (!show.contains(event.relatedTarget)) { hold.keyboard = false; syncPlayState(); }
    });
    document.addEventListener('visibilitychange', syncPlayState);
    reduceMotion.addEventListener('change', syncPlayState);

    // Keyboard: arrow keys, Home and End while the slideshow has focus
    show.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') { go(index + 1); event.preventDefault(); }
      else if (event.key === 'ArrowLeft') { go(index - 1); event.preventDefault(); }
      else if (event.key === 'Home' && event.target === viewport) { go(0); event.preventDefault(); }
      else if (event.key === 'End' && event.target === viewport) { go(slides.length - 1); event.preventDefault(); }
    });

    // Swipe: a mostly horizontal drag of 40px or more changes picture (and doesn't count as a click)
    let startX = 0, startY = 0, tracking = false, swiped = false;
    viewport.addEventListener('pointerdown', event => {
      if (event.target.closest('.slideshow__tools')) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      startX = event.clientX; startY = event.clientY; tracking = true; swiped = false;
    });
    viewport.addEventListener('pointerup', event => {
      if (!tracking) return;
      tracking = false;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) >= 10 || Math.abs(dy) >= 10) swiped = true;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
    });
    viewport.addEventListener('pointercancel', () => { tracking = false; });

    // Enlarge: click the picture, or use the enlarge button (the keyboard-friendly way)
    const enlarge = () => {
      const img = slides[index].querySelector('.slide__image');
      if (img) lightbox.open(controller, img);
    };
    viewport.addEventListener('click', event => {
      if (swiped) { swiped = false; return; }                     // the end of a drag isn't a click
      if (event.target.closest('.slide__image')) enlarge();
    });
    enlargeBtn.addEventListener('click', enlarge);

    // What the enlarged view needs from this slideshow
    const controller = {
      slides,
      go,
      index: () => index,
      setLightbox: open => { hold.lightbox = open; syncPlayState(); },
    };

    show.classList.add('is-ready');                               // reveals the controls and lines the slides up
    go(0);
  });
})();
