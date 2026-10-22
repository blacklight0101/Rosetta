import { safeguards, type Safeguard } from './landing-content.js';
import { renderEvidence, renderPipeline, renderReplay } from './landing-replay.js';
import { escapeHtml as esc } from './html-text.js';

// RF-1200, RF-1201, RNF-010, DEC-63, DEC-70: the public landing page, written by the server as one
// HTML document so it works without JavaScript from 360 px. It follows the approved artboard
// docs/design/board/Landing.dc.html. The page loads no script and no inline style (the content
// security policy allows neither); its style sheet is built from web/src/landing/landing.css.

const sourceUrl = 'https://github.com/blacklight0101/Rosetta';
const description =
  'Rosetta reads a public GitHub repository, a zip or Excel workbooks, writes evidence-cited cards, checks every claim and prepares the hand-off for a modernisation team.';

export interface LandingOptions {
  /** `ROSETTA_CONTACT_EMAIL`: the "Request access" address; without it the page has no such link. */
  readonly contactEmail: string | undefined;
}

// RF-1201
function requestAccess(contactEmail: string | undefined): string {
  if (contactEmail === undefined || contactEmail === '') return '';
  return `<a class="btn sec" href="mailto:${esc(contactEmail)}">Request access</a>`;
}

// DEC-161: the icon is decorative, the name is written next to it; its size is set so the header does not shift.
const headerIcon =
  '<img src="/assets/brand/rosetta-icon-32.png" srcset="/assets/brand/rosetta-icon-64.png 2x" alt="" width="32" height="32">';

function renderHeader(options: LandingOptions): string {
  return `<header class="top">
  <div class="wrap">
    <a class="brand" href="/">${headerIcon}Rosetta</a>
    <nav aria-label="Sections">
      <a class="lnk" href="#how">How it works</a><a class="lnk" href="#evidence">Evidence</a><a class="lnk" href="#cost">Cost</a><a class="lnk" href="#about">About</a>
    </nav>
    <div class="grow"></div>
    ${requestAccess(options.contactEmail)}
    <a class="btn pri" href="/sign-in">Sign in</a>
  </div>
</header>`;
}

// DEC-161: the full logo (responsive 320, 640 and 960 px files) on a light page; on a dark page the icon
// with the name as live text, because the wordmark of the PNG is dark navy. The page has no script, so
// the choice follows prefers-color-scheme in a picture element and in landing.css.
const brandSources = ['320', '640', '960'].map((w) => `/assets/brand/rosetta-full-${w}w.png ${w}w`);

function renderBrand(): string {
  return `<div class="brand-lockup">
    <picture class="brand-hero">
      <source media="(prefers-color-scheme: dark)" srcset="/assets/brand/rosetta-icon-128.png 1x, /assets/brand/rosetta-icon-256.png 2x" width="128" height="128">
      <img src="/assets/brand/rosetta-full-320w.png" srcset="${brandSources.join(', ')}" sizes="160px" alt="Rosetta" width="160" height="160">
    </picture>
    <span class="brand-hero-text" aria-hidden="true">Rosetta</span>
  </div>`;
}

function renderHero(): string {
  return `<section class="wrap hero">
  ${renderBrand()}
  <h1>Watch AI agents read your legacy code, and check every word they write.</h1>
  <div class="hero-aside">
    <p class="lede">Start from a public GitHub URL, a zip of your code or one or more Excel workbooks. Readers explore each area, a verifier tests every claim against the lines it cites, and the spend runs against a cap you set.</p>
    <a class="btn pri" href="/sign-in">Sign in to try it</a>
  </div>
</section>`;
}

function renderCost(): string {
  return `<section id="cost" class="sec-band">
  <div class="wrap split">
    <div class="intro">
      <h2>You see the price before, during and after.</h2>
      <p class="lede">An estimate before the run, a live meter while it works, a cost report when it ends, and the total for the whole project always in the header. Local models through Ollama cost nothing and still count tokens.</p>
    </div>
    <div class="body">
      <div class="cap"><div class="cap-row"><strong>This run</strong><span><strong>$0.39</strong> <span class="lbl">of $0.50</span></span></div><div class="trk trk-run" aria-hidden="true"><span></span></div><span class="lbl">The run stops cleanly before a call that could cross the cap; finished cards are kept.</span></div>
      <div class="cap"><div class="cap-row"><strong>Your day</strong><span><strong>$0.62</strong> <span class="lbl">of $1.00</span></span></div><div class="trk trk-day" aria-hidden="true"><span></span></div><span class="lbl">A daily limit per account when runs use the server's keys.</span></div>
      <div class="cap"><div class="cap-row"><strong>Bring your own key</strong><span class="badge run">Optional</span></div><span class="lbl">Store your own OpenAI or Anthropic key, encrypted. Your runs then bill your account, not the server's.</span></div>
      <p class="lbl note">Illustrative figures. The caps shown are the defaults; the administrator can change them.</p>
    </div>
  </div>
</section>`;
}

const shield =
  '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path class="shield" d="M11 2 18 5v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V5l7-3Z"></path></svg>';

function renderSafeguard(item: Safeguard): string {
  return `<li>${shield}<span><strong>${esc(item.title)}</strong> <span>${esc(item.text)}</span></span></li>`;
}

function renderSecurityAndTechnology(): string {
  return `<section class="sec-band alt">
  <div class="wrap split">
    <div class="col">
      <h2>Built to read code it does not trust.</h2>
      <ul class="plain">
        ${safeguards.map(renderSafeguard).join('\n        ')}
      </ul>
    </div>
    <div class="col">
      <h2>Any stack. Any model.</h2>
      <p class="lede">A universal scan maps code in any language; language packs add symbols where they exist (C# first). Excel workbooks (.xlsx and .xlsm) are a source too. Each agent role picks its own provider and model: Ollama on your machine, OpenAI, Anthropic, or any OpenAI-compatible service.</p>
      <p class="lbl">TypeScript on Node.js · Fastify · Preact · PostgreSQL · one container image</p>
    </div>
  </div>
</section>`;
}

function renderAbout(): string {
  return `<section id="about" class="sec-band">
  <div class="wrap about">
    <div class="about-text">
      <h2>A master's final project, built in the open.</h2>
      <p class="lede">Rosetta is the final project of the Master en Desarrollo con IA at BIG School, by BlackLigth. The design documents, decisions and code are public under the MIT licence.</p>
    </div>
    <div class="about-actions">
      <a class="btn pri" href="/sign-in">Sign in</a>
      <a class="btn sec" href="${sourceUrl}">Read the source on GitHub</a>
    </div>
  </div>
</section>`;
}

function renderFooter(): string {
  return `<footer class="foot">
  <div class="wrap lbl"><span>Rosetta · MIT licence</span><span>Not indexed by search engines</span><div class="grow"></div><a href="${sourceUrl}/blob/main/SECURITY.md">Security</a></div>
</footer>`;
}

function renderHead(): string {
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${esc(description)}">
<title>Rosetta - watch AI agents read legacy code</title>
<link rel="icon" href="/assets/brand/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/brand/rosetta-icon-32.png">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<link rel="manifest" href="/assets/brand/site.webmanifest">
<link rel="stylesheet" href="/assets/landing.css">
</head>`;
}

/** The whole landing page as an HTML document. */
// RF-1200, RF-1201
export function renderLandingPage(options: LandingOptions): string {
  return `<!doctype html>
<html lang="en">
${renderHead()}
<body class="rst-root">
<a class="skip" href="#main-content">Skip to the content</a>
${renderHeader(options)}
<main id="main-content">
${renderHero()}
${renderReplay()}
${renderPipeline()}
${renderEvidence()}
${renderCost()}
${renderSecurityAndTechnology()}
${renderAbout()}
</main>
${renderFooter()}
</body>
</html>
`;
}
