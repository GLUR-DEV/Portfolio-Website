/* ==========================================================
   Site content from the database – JavaScript
   The skill pills, project cards and project pages come from the admin app's database through
   /api/technologies, /api/projects and /api/projects/<slug> (served by src/worker.js).

   How it fits with the other scripts:
   1. This file runs first, fetches the content and rebuilds the pills / cards / project section.
   2. Only then does it load indexscript.js and projectsscript.js (listed in this script tag's
      data-then attribute), because those scripts attach their behaviour (filtering, slideshows,
      card reveal) to whatever is on the page when they run.
   3. If the API is slow, down or not set up, the HTML already in the page is left exactly as it is,
      and the other scripts still load, so the site never ends up blank.
   All database text is added with textContent / setAttribute, never as HTML, so it cannot inject markup.
   ========================================================== */
(() => {
  const FETCH_TIMEOUT_MS = 2000;   // if the API hasn't answered by then, use the saved copy
  const SNAPSHOT_BASE = 'https://glurstorage.blob.core.windows.net/snapshots';
  const THEN = (document.currentScript?.dataset.then || '').split(/\s+/).filter(Boolean);

  /* ---------- Helpers ---------- */

  // el('div', { class: 'x', text: 'Hi' }, child, child): builds an element without using innerHTML
  const el = (tag, attrs = {}, ...kids) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    node.append(...kids.flat().filter(Boolean));
    return node;
  };

  // Only accept a full https:// address, or a plain relative path on this site. Anything else
  // (javascript:, data:, odd characters) is dropped and the placeholder is shown instead.
  const safeImage = path => {
    if (!path) return null;
    if (/^https:\/\/[^\s"'()<>]+$/i.test(path)) return path;
    if (/^[\w\-./]+$/.test(path) && !path.includes('..')) return '/' + path.replace(/^\/+/, '');
    return null;
  };

  // GET /api/<path> -> parsed JSON, null when the server says 404, throws on any other failure
  const getLive = async path => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`/api${path}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`API answered ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  // The saved copy in Azure Storage, written by the admin app (same shape as the API)
  const snapshotName = path => {
    if (path === '/technologies') return 'technologies.json';
    if (path === '/projects') return 'projects.json';
    const match = path.match(/^\/projects\/(.+)$/);
    return match ? `project-${match[1]}.json` : null;
  };

  const getSnapshot = async path => {
    const name = snapshotName(path);
    if (!name) throw new Error(`No saved copy for ${path}`);
    const res = await fetch(`${SNAPSHOT_BASE}/${name}`, { cache: 'no-cache' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Saved copy answered ${res.status}`);
    return await res.json();
  };

  // Live API first; if it is asleep, slow or down, use the saved copy. If both fail, the caller keeps the built-in HTML.
  const getJson = async path => {
    try {
      return await getLive(path);
    } catch (liveError) {
      console.warn(`Live API unavailable (${liveError.message}); using the saved copy`);
      return await getSnapshot(path);
    }
  };

  /* ---------- Landing page: skill pills and project cards ---------- */

  const card = project => {
    const image = el('div', {
      class: 'card__image',
      role: 'img',
      'aria-label': project.coverAlt || `${project.title} screenshot`
    });
    const cover = safeImage(project.coverImagePath);
    if (cover) {
      image.style.backgroundImage = `url("${cover}")`;
      image.style.backgroundSize = 'cover';
      image.style.backgroundPosition = 'center';
    }
    return el('article', { class: 'card' },
      image,
      el('h3', {}, el('a', {
        class: 'card__link',
        href: `projects.html?project=${encodeURIComponent(project.slug)}`,
        text: project.title
      })),
      el('p', { text: project.shortDescription }),
      el('ul', { class: 'card__tags', 'aria-label': 'Technologies used' },
        project.technologies.slice(0, 3).map(t => el('li', { 'data-tech': t.key, text: t.label }))),
      el('p', { class: 'card__cta', 'aria-hidden': 'true' }, 'View project ', el('span', { text: '→' }))
    );
  };

  const renderHome = async () => {
    const [technologies, projects] = await Promise.all([getJson('/technologies'), getJson('/projects')]);
    if (!Array.isArray(technologies) || !Array.isArray(projects)) throw new Error('Unexpected API response');

    document.querySelector('.pills')?.replaceChildren(
      ...technologies.map(t => el('li', {},
        el('button', { type: 'button', class: 'pill', 'aria-pressed': 'false', 'data-tech': t.key, text: t.label }))));

    document.querySelector('.cards').replaceChildren(
      ...(projects.length ? projects.map(card) : [el('p', { text: 'Projects are coming soon.' })]));
  };

  /* ---------- Project page: one project, built from /api/projects/<slug> ---------- */

  const arrow = (dir, symbol, label) =>
    el('button', { type: 'button', class: 'arrow', 'data-dir': dir, 'aria-label': label, text: symbol });

  // One picture: a real <img> when the project has one, otherwise the grey placeholder block
  const picture = (slide, index, isProcess) => {
    const src = safeImage(slide.imagePath);
    if (src) {
      return el('img', { class: 'slide__image', src, alt: slide.imageAlt || '', loading: index === 0 ? 'eager' : 'lazy' });
    }
    const variant = isProcess && index === 0 ? 'wf' : String(2 + (index % 4));
    return el('div', {
      class: `slide__image ph ph--${variant}`,
      role: 'img',
      'aria-label': `Placeholder picture for ${slide.stageLabel}`
    }, el('span', { class: 'ph__label', text: 'Picture coming soon' }));
  };

  const slideshow = (show, ariaLabel, stepsLabel) => {
    const isProcess = show.kind === 'Process';
    const total = show.slides.length;
    return el('div', { class: 'slideshow', 'data-slideshow': true },
      el('div', {
        class: 'slideshow__viewport', tabindex: '0', role: 'region',
        'aria-roledescription': 'carousel', 'aria-label': ariaLabel
      },
        el('div', { class: 'slideshow__track' },
          show.slides.map((slide, i) => el('div', {
            class: 'slide', role: 'group', 'aria-roledescription': 'slide',
            'aria-label': `${i + 1} of ${total}: ${slide.stageLabel}`
          },
            picture(slide, i, isProcess),
            el('div', { class: 'slide__caption' },
              el('p', { class: 'slide__stage', text: slide.stageLabel }),
              el('h3', { text: slide.title }),
              el('p', { text: slide.caption })))))),
      el('div', { class: 'slideshow__controls' },
        el('ol', { class: 'steps', 'aria-label': stepsLabel },
          show.slides.map((slide, i) => el('li', {},
            el('button', {
              type: 'button', class: 'step', 'data-slide': i,
              'aria-current': i === 0 ? 'true' : null, text: slide.stageLabel
            })))),
        el('div', { class: 'slideshow__nav' },
          arrow(-1, '←', 'Previous picture'),
          el('p', { class: 'slideshow__count', 'aria-live': 'polite', text: `1 / ${total}` }),
          arrow(1, '→', 'Next picture'))));
  };

  const noteList = notes => notes.length
    ? el('ul', { class: 'improve' },
        notes.map(n => el('li', {}, el('strong', { text: n.heading }), ` ${n.body}`)))
    : null;

  const facts = project => {
    const rows = [['Role', project.role], ['Tools', project.tools], ['Timeframe', project.timeframe]]
      .filter(([, value]) => value);
    return rows.length
      ? el('dl', { class: 'facts' }, rows.map(([term, value]) => el('div', {}, el('dt', { text: term }), el('dd', { text: value }))))
      : null;
  };

  const projectSection = project => {
    const id = `project-${project.slug}`;
    const processShow = project.slideshows.find(s => s.kind === 'Process' && s.slides.length);
    const improveShow = project.slideshows.find(s => s.kind === 'Improvement' && s.slides.length);
    const feedback = project.notes.filter(n => n.kind === 'Feedback');
    const improved = project.notes.filter(n => n.kind === 'Improved');

    const grids = [];
    let detailsShown = false;

    if (processShow) {
      grids.push(el('div', { class: 'project__grid' },
        el('div', { class: 'project__col' },
          el('h2', { class: 'mini-label', text: `// ${processShow.heading}` }),
          slideshow(processShow, `${project.title} design process`, 'Stages of the design process')),
        el('aside', { class: 'project__aside', 'aria-label': `${project.title} details` },
          feedback.length ? el('h2', { class: 'mini-label', text: '// Feedback' }) : null,
          noteList(feedback),
          el('h2', { class: 'mini-label', text: '// Details' }),
          facts(project))));
      detailsShown = true;
    }

    if (improveShow) {
      grids.push(el('div', { class: 'project__grid project__grid--flip' },
        el('div', { class: 'project__col' },
          el('h2', { class: 'mini-label', text: `// ${improveShow.heading}` }),
          slideshow(improveShow, `${project.title} improvements`, 'Versions of the project')),
        el('aside', { class: 'project__aside', 'aria-label': `${project.title} improvements` },
          improved.length ? el('h2', { class: 'mini-label', text: '// What improved' }) : null,
          noteList(improved),
          detailsShown ? null : el('h2', { class: 'mini-label', text: '// Details' }),
          detailsShown ? null : facts(project))));
    }

    return el('section', {
      class: 'project container', id, 'data-project': project.slug,
      'data-title': project.title, 'aria-labelledby': `${id}-title`
    },
      el('div', { class: 'project__head' },
        el('p', { class: 'hero__tagline', text: 'Project' }),
        el('h1', { id: `${id}-title`, text: project.title }),
        el('p', { text: project.summary || project.shortDescription }),
        el('ul', { class: 'card__tags', 'aria-label': 'Technologies used' },
          project.technologies.map(t => el('li', { 'data-tech': t.key, text: t.label })))),
      ...grids);
  };

  const notFound = () => el('section', { class: 'project container', 'data-project': 'not-found', 'data-title': 'Project not found' },
    el('div', { class: 'project__head' },
      el('h1', { text: 'Project not found' }),
      el('p', {}, 'That project does not exist (or is not published yet). ',
        el('a', { href: 'index.html#work', text: 'Back to my work' }), '.')));

  const renderProject = async () => {
    const slug = new URLSearchParams(window.location.search).get('project');
    let project = null;

    if (slug) {
      project = await getJson(`/projects/${encodeURIComponent(slug)}`);
      // Old links used ?project=one; the database slug is project-one
      if (!project && !slug.startsWith('project-')) project = await getJson(`/projects/${encodeURIComponent(`project-${slug}`)}`);
    } else {
      const list = await getJson('/projects');
      if (!Array.isArray(list)) throw new Error('Unexpected API response');
      if (list.length) project = await getJson(`/projects/${encodeURIComponent(list[0].slug)}`);
    }

   // The API answered, so the built-in placeholder projects are replaced
   document.querySelectorAll('.project').forEach(section => section.remove());
   const main = document.getElementById('main');
   const section = project ? projectSection(project) : notFound();
   const next = main.querySelector('.next');   // the "// Next" call-to-action at the bottom
   if (next) next.before(section);             // keep the project above it
   else main.append(section);
  };

  /* ---------- Go: render, then load the scripts that attach behaviour ---------- */

  const loadScripts = list => list.reduce((chain, src) => chain.then(() => new Promise(done => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = script.onerror = done;
    document.body.append(script);
  })), Promise.resolve());

  (async () => {
    try {
      if (document.querySelector('.cards')) await renderHome();
      else if (document.querySelector('.project')) await renderProject();
    } catch (err) {
      console.warn('Showing the built-in content instead:', err.message);
    }
    await loadScripts(THEN);
  })();
})();
