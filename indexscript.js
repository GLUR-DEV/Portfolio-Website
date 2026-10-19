/* ==========================================================
   Portfolio landing page – JavaScript (motion)
   1. Sticky header state   2. Code typing effect
   3. Work card reveal      4. Active nav link
   Everything respects "prefers-reduced-motion".
   ========================================================== */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Sticky header state ----------
     Adds .is-scrolled once the page moves, which the CSS uses to
     show the frosted background and shrink the bar. */
  const header = document.querySelector('.site-header');
  const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 20);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  /* ---------- 2. Code typing effect ----------
     Empties every text node in the code card, then types the original
     text back one character at a time, keeping the syntax colours. */
  const code = document.querySelector('.code-card code');
  if (code && !reduceMotion) {
    const pre = code.parentElement;
    pre.style.minHeight = pre.offsetHeight + 'px';   // reserve full height so the layout doesn't jump

    // Collect and clear the text nodes
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (walker.nextNode()) {
      parts.push({ node: walker.currentNode, text: walker.currentNode.nodeValue });
      walker.currentNode.nodeValue = '';
    }

    // Blinking cursor that follows the typing
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    cursor.setAttribute('aria-hidden', 'true');

    let part = 0;   // which text node we're typing into
    let char = 0;   // how many characters of it are shown
    const type = () => {
      if (part >= parts.length) return;              // finished: cursor keeps blinking
      const { node, text } = parts[part];
      char += 1;
      node.nodeValue = text.slice(0, char);
      node.after(cursor);
      if (char >= text.length) { part += 1; char = 0; }
      const typed = text[char - 1] || '';
      setTimeout(type, /\s/.test(typed) ? 8 : 28);   // whitespace is quicker than letters
    };
    setTimeout(type, 700);                           // short pause after page load
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
     Highlights the nav item for the section currently in view. */
  const links = document.querySelectorAll('.nav a');
  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        links.forEach(link => {
          if (link.getAttribute('href') === '#' + entry.target.id) {
            link.setAttribute('aria-current', 'true');
          } else {
            link.removeAttribute('aria-current');
          }
        });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });          // triggers near the middle of the screen
    ['work', 'stack', 'about', 'contact'].forEach(id => {
      const el = document.getElementById(id);
      if (el) spy.observe(el);
    });
  }
})();
