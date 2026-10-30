// Starter components inserted into a workspace the first time it opens the
// arena. They are ordinary production-style markup; their failures come from
// real layout behavior (nowrap rows, fixed grid tracks, negative margins,
// compact-mode media queries) that the DOM engine measures in the iframe.

export type SeedComponent = {
  name: string;
  slug: string;
  html: string;
  css: string;
  tokens: Record<string, string>;
};

const pricingHtml = `<header class="pricing">
  <div class="pricing__top">
    <h2 class="pricing__title">Plans that scale with your ledger</h2>
    <div class="currency" role="group" aria-label="Billing currency">
      <button class="currency__opt is-active" type="button">USD</button>
      <button class="currency__opt" type="button">EUR</button>
      <button class="currency__opt" type="button">GBP</button>
      <button class="currency__opt" type="button">JPY</button>
    </div>
  </div>
  <div class="tiers">
    <article class="tier">
      <h3 class="tier__name">Starter</h3>
      <p class="tier__price"><span class="tier__amount">$19</span><span class="tier__per">per seat / month</span></p>
      <p class="tier__note">Up to 5 seats, 2 entities</p>
      <a class="tier__cta" href="#starter">Start free trial</a>
    </article>
    <article class="tier tier--featured">
      <span class="tier__badge">Most popular</span>
      <h3 class="tier__name">Growth</h3>
      <p class="tier__price"><span class="tier__amount">$49</span><span class="tier__per">per seat / month</span></p>
      <p class="tier__note">Unlimited entities, multi-currency close</p>
      <a class="tier__cta" href="#growth">Start free trial</a>
    </article>
    <article class="tier">
      <h3 class="tier__name">Enterprise</h3>
      <p class="tier__price"><span class="tier__amount">Custom</span><span class="tier__per">annual contract</span></p>
      <p class="tier__note">SSO, audit trail, dedicated controller</p>
      <a class="tier__cta" href="#enterprise">Talk to sales</a>
    </article>
  </div>
  <p class="pricing__fine" data-optional>Prices exclude VAT. Annual billing saves 18%.</p>
</header>`;

const pricingCss = `.pricing {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  padding: var(--space-section) var(--space-gutter);
  background: var(--surface);
  color: var(--ink);
}
.pricing__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.pricing__title {
  margin: 0;
  font-size: 1.75rem;
  line-height: 1.2;
  white-space: nowrap;
}
.currency {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 999px;
  background: #e8ebef;
  flex-shrink: 0;
}
.currency__opt {
  min-width: 52px;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ink-muted);
  font: 600 0.8125rem/1 inherit;
}
.currency__opt.is-active {
  background: #ffffff;
  color: var(--ink);
}
.tiers {
  display: grid;
  grid-template-columns: repeat(3, minmax(260px, 1fr));
  gap: var(--space-gap);
  margin-top: 2rem;
}
.tier {
  position: relative;
  padding: 1.5rem;
  border: 1px solid #dfe3e8;
  border-radius: 12px;
  background: #ffffff;
}
.tier__badge {
  position: absolute;
  top: -12px;
  right: 16px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--accent);
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 600;
}
.tier__name { margin: 0 0 0.5rem; font-size: 1.125rem; }
.tier__price { display: flex; align-items: baseline; gap: 0.375rem; margin: 0; }
.tier__amount { font-size: 2.5rem; font-weight: 700; letter-spacing: -0.02em; }
.tier__per { color: var(--ink-muted); font-size: 0.875rem; }
.tier__note { margin: 0.75rem 0 1.25rem; color: var(--ink-muted); font-size: 0.9375rem; }
.tier__cta {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 18px;
  border-radius: 8px;
  background: var(--ink);
  color: #ffffff;
  font-weight: 600;
  text-decoration: none;
}
.pricing__fine { margin: 1.5rem 0 0; color: var(--ink-muted); font-size: 0.8125rem; }
@media (max-width: 720px) {
  .currency__opt { min-width: 0; min-height: 30px; padding: 0 8px; }
  .currency { gap: 0; }
}
@media (max-width: 640px) {
  .tiers { grid-template-columns: 1fr; gap: 8px; }
  .tier--featured { background: var(--ink); color: #ffffff; }
}`;

const ledgerHtml = `<section class="ledger">
  <header class="ledger__head">
    <h2 class="ledger__title">Recent activity</h2>
    <button class="ledger__filter" type="button">Filter</button>
  </header>
  <ul class="txns">
    <li class="txn">
      <span class="txn__icon" aria-hidden="true">AW</span>
      <div class="txn__main">
        <p class="txn__merchant">Amazon Web Services EMEA SARL</p>
        <p class="txn__meta">Card •••• 4821 · Oct 28, 09:41</p>
      </div>
      <span class="pill pill--pending">Pending review</span>
      <span class="txn__amount">-$12,480.00</span>
      <div class="txn__actions">
        <button class="icon-btn" type="button" aria-label="Split transaction">⇄</button>
        <button class="icon-btn" type="button" aria-label="Attach receipt">⎙</button>
        <button class="icon-btn" type="button" aria-label="More actions">⋯</button>
      </div>
    </li>
    <li class="txn">
      <span class="txn__icon" aria-hidden="true">GS</span>
      <div class="txn__main">
        <p class="txn__merchant">Gusto Payroll — October cycle 2</p>
        <p class="txn__meta">ACH · Oct 27, 17:02</p>
      </div>
      <span class="pill pill--cleared">Cleared</span>
      <span class="txn__amount">-$84,212.19</span>
      <div class="txn__actions">
        <button class="icon-btn" type="button" aria-label="Split transaction">⇄</button>
        <button class="icon-btn" type="button" aria-label="Attach receipt">⎙</button>
        <button class="icon-btn" type="button" aria-label="More actions">⋯</button>
      </div>
    </li>
    <li class="txn">
      <span class="txn__icon" aria-hidden="true">ST</span>
      <div class="txn__main">
        <p class="txn__merchant">Stripe payout · Acct 7732</p>
        <p class="txn__meta" data-optional>Transfer · Oct 27, 06:15</p>
      </div>
      <span class="pill pill--flagged">Flagged: FX variance</span>
      <span class="txn__amount txn__amount--in">+$31,905.42</span>
      <div class="txn__actions">
        <button class="icon-btn" type="button" aria-label="Split transaction">⇄</button>
        <button class="icon-btn" type="button" aria-label="Attach receipt">⎙</button>
        <button class="icon-btn" type="button" aria-label="More actions">⋯</button>
      </div>
    </li>
  </ul>
</section>`;

const ledgerCss = `.ledger {
  font-family: "Inter", system-ui, -apple-system, sans-serif;
  background: var(--panel);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 14px;
  margin: var(--frame-margin);
}
.ledger__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
}
.ledger__title { margin: 0; font-size: 1rem; }
.ledger__filter {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  font: inherit;
}
.txns { list-style: none; margin: 0; padding: 0; }
.txn {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto 128px 148px;
  align-items: center;
  gap: var(--row-gap);
  padding: 12px 20px;
  border-bottom: 1px solid var(--line);
}
.txn__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #eef1f6;
  font-size: 0.75rem;
  font-weight: 700;
}
.txn__main { min-width: 0; }
.txn__merchant {
  margin: 0;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
}
.txn__meta { margin: 2px 0 0; color: var(--ink-muted); font-size: 0.8125rem; }
.pill {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}
.pill--pending { background: #fff3d1; color: #7a4f00; }
.pill--cleared { background: #e1f5e8; color: #1d6b3a; }
.pill--flagged { background: #fde4e1; color: #a1281c; }
.txn__amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.txn__amount--in { color: #1d6b3a; }
.txn__actions { display: flex; justify-content: flex-end; gap: 4px; }
.icon-btn {
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 8px;
  background: #f2f4f7;
  color: var(--ink);
  font-size: 1rem;
}
@media (max-width: 1100px) {
  .icon-btn { width: 32px; height: 32px; }
  .txn__actions { gap: 2px; }
}
@media (max-width: 860px) {
  .txn__amount { margin-left: -28px; }
}`;

const navHtml = `<nav class="topnav" aria-label="Primary">
  <a class="topnav__brand" href="#home"><span class="topnav__logo" aria-hidden="true"></span>Northwind Freight</a>
  <ul class="topnav__links">
    <li><a href="#shipments">Shipments</a></li>
    <li><a href="#carriers">Carriers</a></li>
    <li><a href="#customs">Customs</a></li>
    <li><a href="#warehousing">Warehousing</a></li>
    <li><a href="#analytics">Analytics</a></li>
  </ul>
  <div class="topnav__right">
    <a class="topnav__signin" href="#signin">Sign in</a>
    <a class="topnav__cta" href="#demo">Book a demo</a>
  </div>
  <button class="topnav__burger" type="button" aria-label="Open menu"><span></span></button>
</nav>`;

const navCss = `.topnav {
  display: flex;
  align-items: center;
  gap: var(--nav-gap);
  height: 64px;
  padding: 0 var(--nav-pad);
  background: var(--nav-bg);
  color: #ffffff;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  overflow: hidden;
}
.topnav__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  color: #ffffff;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}
.topnav__logo {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--brand);
}
.topnav__links {
  display: flex;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.topnav__links a {
  display: block;
  padding: 12px 14px;
  color: #c5d0de;
  text-decoration: none;
  white-space: nowrap;
}
.topnav__right {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}
.topnav__signin {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 10px;
  color: #c5d0de;
  text-decoration: none;
  white-space: nowrap;
}
.topnav__cta {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 18px;
  border-radius: 8px;
  background: var(--brand);
  color: var(--nav-bg);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.topnav__burger { display: none; }
@media (max-width: 760px) {
  .topnav__links { display: none; }
  .topnav__cta { background: transparent; color: #5b6b82; border: 1px solid #5b6b82; }
  .topnav__burger {
    display: block;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 8px;
    background: #1c2b42;
  }
}
@media (max-width: 480px) {
  .topnav__signin { display: none; }
}`;

export const SEED_COMPONENTS: SeedComponent[] = [
  {
    name: "Pricing header · currency switcher",
    slug: "pricing-header",
    html: pricingHtml,
    css: pricingCss,
    tokens: {
      "--space-section": "3rem",
      "--space-gutter": "1.5rem",
      "--space-gap": "1.5rem",
      "--accent": "#1f6feb",
      "--ink": "#14171c",
      "--ink-muted": "#59626e",
      "--surface": "#f6f7f9",
    },
  },
  {
    name: "Fintech transaction rows",
    slug: "ledger-rows",
    html: ledgerHtml,
    css: ledgerCss,
    tokens: {
      "--panel": "#ffffff",
      "--ink": "#121826",
      "--ink-muted": "#5d6878",
      "--line": "#e4e8ee",
      "--row-gap": "12px",
      "--frame-margin": "16px",
    },
  },
  {
    name: "Responsive navigation bar",
    slug: "freight-topnav",
    html: navHtml,
    css: navCss,
    tokens: {
      "--nav-bg": "#0f1b2d",
      "--brand": "#ffb020",
      "--nav-gap": "24px",
      "--nav-pad": "24px",
    },
  },
];
