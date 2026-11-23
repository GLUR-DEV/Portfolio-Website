# Portfolio-Website

The source for **[glursolutions.com](https://glursolutions.com)**, my portfolio site: a dark, hand-written HTML/CSS/JS front end served by a Cloudflare Worker, with project content edited in a separate ASP.NET admin app and a spam-filtered contact form.

There is no framework and no build step. The `public/` folder is the site, and the Worker in `src/` is the only server code.

## What it does

- **Landing page** with an animated hero and floating code windows, skill pills that filter the project cards, a contact form, an About section and an animated lava-lamp background drawn on `<canvas>`.
- **Motion that replays and respects you.** Project cards, skill pills and the contact section animate in each time they scroll into view, the hero plays once, and every animation is switched off for visitors who prefer reduced motion. See [Motion and interaction](#motion-and-interaction).
- **One shared project page** (`projects.html?project=<slug>`) that shows whichever project the address names. Each project has a design-process slideshow, an improvements slideshow, feedback and "what improved" notes, a details panel (role, tools, timeframe) and two optional buttons: **Go to live site** and **See the design notes**.
- **Slideshows** that advance every 5 seconds with a countdown bar and pause button, plus arrows, stage buttons, arrow/Home/End keys, swipe, and an enlarged (lightbox) view.
- **Contact form** that validates on the server, filters spam, saves every message to Cloudflare D1 and emails an alert.
- **Content from a database** without a live API: pages read JSON snapshots written by the admin app, so visitors never touch the database.
- **Accessible and responsive**: skip link, labelled landmarks, visible focus, `prefers-reduced-motion` handled in CSS and JS, decorative code windows hidden from assistive technology, and layouts that change at 1440px, 900px, 800px, 600px and 550px. Hover animations only run on devices that can really hover, so a tap on a phone never leaves one stuck on.

## How it fits together

```mermaid
flowchart LR
  V[Visitor] --> W[Cloudflare Worker]
  W -->|static files| P[public/]
  W -->|POST /api/contact| D[(D1 messages)]
  W -->|alert| E[Email]
  W -->|GET /api/technologies and /api/projects| B[(Azure Blob JSON snapshots)]
  W -->|/admin| A[ASP.NET admin app]
  A --> S[(Azure SQL)]
  A -->|publishes on every save| B
```

| Request | Handled by | Goes to |
| --- | --- | --- |
| `/admin`, `/admin/*` (any capitalisation) | `src/adminProxy.js` | The ASP.NET admin app on Azure |
| `POST /api/contact` | `handleContact` in `src/worker.js` | D1 database, then an email alert |
| `GET /api/technologies`, `/api/projects`, `/api/projects/<slug>` | `handleContent` in `src/worker.js` | The saved JSON in Azure Blob storage, cached at the edge |
| Any other `/api/*` | Worker | `404` |
| Everything else | Static assets | Files in `public/` |

`wrangler.toml` lists `/api/*` and the admin paths in `run_worker_first`, so only those requests wake the Worker. Everything else is served straight from `public/`.

The admin app lives in its own repository: [GlurSolutions-DB-ASP.NET-Web-App](https://github.com/GLUR-DEV/GlurSolutions-DB-ASP.NET-Web-App). It writes `technologies.json`, `projects.json` and one `project-<slug>.json` per published project to Blob storage on every save.

## Repository layout

```
public/                  The website (the only public folder)
  index.html             Landing page
  projects.html          Shared project page (placeholder projects as a fallback)
  content.js             Fetches content from /api and builds the cards, pills and project page
  indexscript.js         Header, code windows, scroll-in animations, hero entrance, card hover layer, skill pills, nav highlight, skill filter, contact form, lava lamp
  projectsscript.js      Project picker, slideshows, enlarged-picture view
  indexstyles.css        Design tokens, shared styles and all landing page motion
  projectsstyles.css     Project page styles
src/
  worker.js              /api/contact, content proxy and request routing
  filters.js             Email validation, DNS check and spam scoring
  email.js               Alert email
  adminProxy.js          Forwards /admin to the ASP.NET app
migrations/              D1 (SQLite) migrations for the messages table
wrangler.toml            Worker, assets, D1, email and variable configuration
```

## Front end

- **Load order.** Both pages load only `content.js` (with a `data-then` list). It fetches the content, rebuilds the pills, cards or project section, and only then loads `indexscript.js` and `projectsscript.js`, so filters, slideshows and animations attach to the real content.
- **Safe fallback.** If `/api` is slow (4 second timeout), down or not configured, the placeholder HTML already in the page is left as it is and the other scripts still load, so the site is never blank.
- **No injected markup.** Database text is added with `textContent` and `setAttribute`, never as HTML. Image addresses must be `https://` or a plain path on the site, and the two project button addresses must be `https://`.
- **Project addresses.** `projects.html?project=<slug>` shows one project. Old links such as `?project=one` map to `project-one`, and an unknown name shows "Project not found".
- **Images.** The header and footer logos (a smaller version on phones), the favicon and project screenshots are served from Azure Blob storage, not from this repository.
- **Mobile project limit.** At 600px and narrower, at most 3 projects show at once, and the status line says so (for example "Showing the first 3 of 5 projects").
- **Design.** Bricolage Grotesque for text and JetBrains Mono for labels and code. Tokens (colours, type, radii) are CSS variables at the top of `indexstyles.css`; the design uses one green accent and a sparing terracotta.

## Motion and interaction

All of this lives in `indexscript.js` and `indexstyles.css` (the file headers list each section). Everything is skipped for `prefers-reduced-motion` visitors, who see the final state straight away, and the page works with JavaScript off because things are only hidden before they animate in while JS is running.

- **Scroll-in replay.** One helper (`inView`) switches an entrance on when an element is at least 20% visible and off again once it has left the screen completely, so it plays again the next time the visitor scrolls back. Project cards, skill pills and the contact section use it, staggered by order. The hero entrance is separate and plays once.
- **Hero entrance.** The tagline, each line of the headline and summary, the two buttons and the social links rise in one after another in about 1.3s. The script measures where the headline and summary wrap at the current width and splits them into lines, re-splitting on resize or font load without replaying. The text itself is untouched, so screen readers still read it as one sentence.
- **Hero buttons and social links.** "View my work" turns pale and slides in a down arrow. "Get in touch" fills green from the left and an envelope tilts in. The GitHub and LinkedIn chips (hero, contact and footer) fill green on hover. All of them press down slightly on click. Hover versions only run where a pointer can hover (`@media (hover: hover)`); on touch screens a tap shows just the press-down. Keyboard focus triggers the same animations. Under 1440px the "Get in touch" outline is green so it stands out against the lava lamp.
- **Code windows.** Three decorative windows (C#, JavaScript, SQL), each with a title bar, file tab, language badge, line numbers and status bar.
  - **800px and wider:** they float in the right-hand column and out into the free space to its right, as far as the window edge allows without touching the hero text, header or Skills heading. They spawn at slightly random spots on every load, can be dragged with mouse, pen or touch (kept inside the area), and are joined by glowing connector lines that sit underneath so they never cross the code. The entrance takes about 1.3s.
  - **Under 800px:** one C# window sits under the hero text with the same look, no dragging or connectors, and its code is typed out.
  - **Never scrolls sideways.** The window measures its own width (a container query on `.code-stack`) and scales its font to fit the longest line. When even the smallest comfortable size would not fit, window 1 swaps to a short 3-line snippet.
  - The windows are `aria-hidden` and dragging is pointer-only, because they hold nothing that is not also in the Stack section.
- **Project cards.** On hover or keyboard focus the cover unfolds from its 120px band to its full 16:10 size over the card, and the title, full description and tags with a "View" cue fade in below it. `indexscript.js` builds this layer for each card from the cover and text already on the card, so `content.js` needs no change. Nothing moves in the layout, and short cards get a minimum height that fits the unfolded layout.
- **Skill pills.** They rise and fade in one after another. Hovering (with a mouse) opens a green dot and grows the pill slightly. A selected pill always shows the dot, and on touch screens the dot shows on selected pills only. Pills are a little smaller under 550px.
  - **"See more".** If the pills would need 3 or more rows, two rows are kept and a "See more" pill takes the place of the last pill on row 2. Pressing it shows the rest below (and it becomes "See less"). It re-measures on resize, rotation and font load, and the entrance plays once only while this layout is active. It is a plain button, not a filter. A selected pill that is hidden behind it still filters the projects.
- **Contact section.** The label, intro, links, form panel and each field play an entrance sequence when the section scrolls into view. While someone types, the panel gets a faint green edge, the active label turns green, the message label shows a live "0 / 5000" counter, and the send button lifts and slides in a paper plane, with a disabled state while sending.
- **Lava lamp.** Canvas metaballs. On screens wider than 1440px two canvases fill the empty page margins. At 1440px and narrower, where the margins are too small, one full-page canvas sits behind the content, dimmed and darkened so text and panels keep their contrast.

## Contact form

The form posts JSON to `/api/contact`. Without JavaScript it falls back to a `mailto:` link. In the browser, native validation runs first, then the form sends the message along with the hidden honeypot value and the time it took to fill in. A rejected message shows the server's reason in the status line, and any other failure points the visitor to the email address. The Worker runs these checks in order:

1. **Honeypot.** A filled hidden field gets a normal "ok" reply and nothing is saved.
2. **Basics.** Name and message are required (name up to 100 characters, message 10 to 5000).
3. **Email.** Format check, then throwaway-inbox and placeholder domains are rejected, then Cloudflare DNS-over-HTTPS (2 second timeout) confirms the domain exists and can take mail. A failed lookup never blocks a real visitor.
4. **Rate limit and duplicates.** At most 5 messages per hour per hashed IP, and an identical email and message within 24 hours is ignored. Only a salted one-way hash of the IP is stored, never the address itself.
5. **Scoring** (`src/filters.js`) adds points for links, spam and cold-outreach wording, odd text, odd names, missing mail servers and a form filled in too quickly.

| Score | Status | What happens |
| --- | --- | --- |
| 0 to 2 | `ok` | Saved, alert emailed |
| 3 to 5 | `review` | Saved, alert emailed with a `[Check]` subject and the reasons |
| 6 or more | `spam` | Saved quietly, no alert |

Nothing is ever thrown away, so false positives can be reviewed, and spammers get the same friendly reply as everyone else. Alerts are sent with Cloudflare's `send_email` binding, with the visitor set as `Reply-To`.

## Admin area

`/admin` is forwarded by `src/adminProxy.js` to the ASP.NET app. The proxy:

- sends a secret header (`X-Origin-Secret`) that the app requires, so the plain `azurewebsites.net` address shows nothing;
- passes the real visitor IP in `X-Client-Ip` and always overwrites any value the browser sent;
- redirects other capitalisations to lower-case `/admin` and rewrites redirects from the Azure address to the public site;
- sets `Cache-Control: no-store` and removes `Server` and `X-Powered-By`.

Cloudflare Access sits in front of `/admin` as a first sign-in layer, and the app has its own login. Access is configured in Cloudflare, not in this repository.

## Running it locally

You need Node.js and a Cloudflare account. Wrangler is run with `npx`, so there is no `package.json` or install step.

```bash
# Create the local D1 tables
npx wrangler d1 migrations apply glur-db --local

# Start the Worker and static site
npx wrangler dev
```

Content is read from the `SNAPSHOT_BASE` address in `wrangler.toml`, so the local site shows the published projects. To test `/admin`, add `ADMIN_ORIGIN_SECRET` to a `.dev.vars` file (it is git-ignored). If `EMAIL` or the alert addresses are not configured, the alert is skipped and the message is still saved.

## Configuration

Values live in `wrangler.toml`. Secrets are never committed.

| Name | Kind | Purpose |
| --- | --- | --- |
| `ASSETS` | Assets binding | Serves the `public/` folder |
| `DB` | D1 binding (`glur-db`) | Contact messages |
| `EMAIL` | Email binding | Sends alerts to one fixed address |
| `ALERT_TO`, `ALERT_FROM` | Variables | Alert addresses (the sender must be on a Cloudflare-verified domain) |
| `SNAPSHOT_BASE` | Variable | Blob container holding the JSON snapshots (needs public read, or the Worker must send a key) |
| `API_ORIGIN` | Variable | Admin app address, used only to forward `/admin` |
| `ADMIN_ORIGIN_SECRET` | Secret | Must match the admin app's `Admin__OriginSecret`. Set with `npx wrangler secret put ADMIN_ORIGIN_SECRET` |
| `IP_SALT` | Secret (optional) | Salt for the hashed IP used by the rate limit |

## Database migrations

`migrations/` holds the D1 migrations for the `messages` table:

- `0001_create_messages.sql` creates the table.
- `0002_message_filtering.sql` adds `status`, `score`, `reasons`, `ip_hash` and `alerted`, plus an index for the rate limit.

Apply them to the live database with `npx wrangler d1 migrations apply glur-db --remote`.

## Deploying

Deploy the Worker and `public/` together with `npx wrangler deploy`. The Worker `name` in `wrangler.toml` must match the Worker in the Cloudflare dashboard.

After changing anything in `wrangler.toml`, redeploy so the new bindings and variables take effect. Content edits do not need a deploy: they go through the admin app and appear within about two minutes, once the edge and browser caches (60 seconds each) expire.

## Versions

Each release is a commit whose message starts with the version (for example `v1.5.20: ...`), with matching release notes on the GitHub Releases page.

## Content and caching

The Worker serves each snapshot from Cloudflare's edge cache for 60 seconds, then re-reads it from Blob storage (8 second timeout). If storage is unreachable, the last good copy, up to 24 hours old, is served instead. A missing file returns `404`, and a storage failure returns a short reason code (`storage-status-<code>`, `timeout` or `network`), never an internal message.
