/* ==========================================================
   Portfolio landing page – JavaScript (motion)
   1. Sticky header state   2. Code typing effect
   3. Work card reveal      4. Active nav link
   5. Stack pill toggles and project filtering
   6. Contact form (opens the visitor's email app)
   Everything respects "prefers-reduced-motion".
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
     Empties every text node in the code card, then types the original
     text back one character at a time, keeping the syntax colours. */
  const code = document.querySelector('.code-card code');
  if (code && !reduceMotion) {
    const pre = code.parentElement;
    pre.style.minHeight = pre.offsetHeight + 'px';   // reserve full height so the layout doesn't jump

    // Collect and clear the text nodes (empty ones are skipped)
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue.length) parts.push({ node, text: node.nodeValue });
      node.nodeValue = '';
    }

    // Blinking cursor that follows the typing
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    cursor.setAttribute('aria-hidden', 'true');

    let part = 0;   // which text node we're typing into
    let char = 0;   // how many characters of it are shown
    const type = () => {
      const { node, text } = parts[part];
      if (char === 0) node.after(cursor);            // move the cursor only when a new node starts
      char += 1;
      node.nodeValue = text.slice(0, char);
      const typed = text[char - 1];
      if (char >= text.length) { part += 1; char = 0; }
      // Keep scheduling only while there is text left; the cursor then just blinks
      if (part < parts.length) setTimeout(type, /\s/.test(typed) ? 8 : 28);  // whitespace is quicker
    };
    if (parts.length) setTimeout(type, 700);         // short pause after page load
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
  const links = document.querySelectorAll('.nav a');
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
    const atBottom = window.scrollY > 0 &&
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
  const status = document.querySelector('.work__status');

  // The tag elements of a card (only the first 3 count)
  const tagsOf = card => Array.from(card.querySelectorAll('.card__tags li')).slice(0, 3);

  const applyFilter = () => {
    let shown = 0;
    cards.forEach(card => {
      const tags = tagsOf(card);
      const matches = selectedStack.size === 0 ||
        tags.some(tag => selectedStack.has(tag.dataset.tech));
      card.hidden = !matches;                         // hidden cards drop out of the grid
      if (matches) shown += 1;
      tags.forEach(tag => tag.classList.toggle('is-match', selectedStack.has(tag.dataset.tech)));
    });

    // Status line: empty (hidden) with no filter, otherwise a count or a "none" message
    if (selectedStack.size === 0) {
      status.textContent = '';
    } else if (shown === 0) {
      status.textContent = 'No projects match the selected tags.';
    } else {
      status.textContent = `Showing ${shown} of ${cards.length} projects`;
    }
  };

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
     On submit this builds a mailto: link (subject and body
     filled in) and opens the visitor's email app. The address comes from the form's
     data-email attribute. Native validation (required fields, valid email) runs first. */
  const form = document.querySelector('.contact-form');
  if (form) {
    const formStatus = form.querySelector('.form__status');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get('name')).trim();
      const email = String(data.get('email')).trim();
      const message = String(data.get('message')).trim();

      const subject = `Website enquiry from ${name}`;
      const body = `${message}\n\n${name}\n${email}`;
      window.location.href =
        `mailto:${form.dataset.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      formStatus.textContent = `Opening your email app. If nothing opens, email ${form.dataset.email} directly.`;
    });
  }
})();
