/* ==========================================================
   Project page – JavaScript (project picker and slideshows)
   Project picker: the page holds one section per project, but only the one named in the address
   is shown (projects.html?project=one, =two ... as linked from the cards on index.html). With no
   or an unknown name the first project is shown.
   Slideshows: turns every [data-slideshow] into a slideshow with:
   - previous / next arrows (they loop round)
   - stage buttons that jump straight to a picture
   - left / right arrow keys while the slideshow is focused
   - swipe on touch screens
   There is no autoplay. Slides that are off screen are hidden from screen readers, and the
   counter is announced politely when the picture changes.
   Header, lava lamp and everything else shared with index.html live in indexscript.js.
   ========================================================== */
(() => {
  /* ---------- Project picker ---------- */
  const projects = Array.from(document.querySelectorAll('.project'));
  if (projects.length) {
    const wanted = new URLSearchParams(window.location.search).get('project');
    const current = projects.find(p => p.dataset.project === wanted) || projects[0];
    projects.forEach(p => { p.hidden = p !== current; });
    document.title = `${current.dataset.title} | GLUR Solutions`;
  }

  /* ---------- Slideshows ---------- */
  document.querySelectorAll('[data-slideshow]').forEach(show => {
    const viewport = show.querySelector('.slideshow__viewport');
    const track = show.querySelector('.slideshow__track');
    const slides = Array.from(show.querySelectorAll('.slide'));
    const steps = Array.from(show.querySelectorAll('.step'));
    const count = show.querySelector('.slideshow__count');
    if (!viewport || !track || slides.length < 2) return;

    let index = 0;

    const go = next => {
      index = (next + slides.length) % slides.length;           // wrap round at either end
      track.style.transform = `translateX(${-100 * index}%)`;
      slides.forEach((slide, i) => slide.setAttribute('aria-hidden', String(i !== index)));
      steps.forEach((step, i) => {
        if (i === index) step.setAttribute('aria-current', 'true');
        else step.removeAttribute('aria-current');
      });
      if (count) count.textContent = `${index + 1} / ${slides.length}`;
    };

    // Arrows and stage buttons
    show.querySelectorAll('.arrow').forEach(btn =>
      btn.addEventListener('click', () => go(index + Number(btn.dataset.dir))));
    steps.forEach((step, i) => step.addEventListener('click', () => go(i)));

    // Keyboard: arrow keys, Home and End while the slideshow has focus
    show.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') { go(index + 1); event.preventDefault(); }
      else if (event.key === 'ArrowLeft') { go(index - 1); event.preventDefault(); }
      else if (event.key === 'Home' && event.target === viewport) { go(0); event.preventDefault(); }
      else if (event.key === 'End' && event.target === viewport) { go(slides.length - 1); event.preventDefault(); }
    });

    // Swipe: a mostly horizontal drag of 40px or more changes picture
    let startX = 0, startY = 0, tracking = false;
    viewport.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      startX = event.clientX; startY = event.clientY; tracking = true;
    });
    viewport.addEventListener('pointerup', event => {
      if (!tracking) return;
      tracking = false;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
    });
    viewport.addEventListener('pointercancel', () => { tracking = false; });

    show.classList.add('is-ready');                              // reveals the controls and lines the slides up
    go(0);
  });
})();
