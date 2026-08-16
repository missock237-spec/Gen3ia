/**
 * ============================================================
 * Gen3ia - Widget de recommandation SaaS (navigateurs/extensions)
 * ------------------------------------------------------------
 * Integration:
 *   <script src="https://<APP_URL>/gen3ia-recommend.js"
 *           data-partner-key="g3ia_..."
 *           data-theme="light|dark|auto"
 *           data-position="inline|bottom-right"
 *           async></script>
 *
 * - Affiche une carte produit Gen3ia dans le container
 *   [data-gen3ia-recommend] ou un bouton flottant.
 * - Track automatiquement les evenements view / click
 *   via l'API publique de tracking.
 * ============================================================
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var PARTNER_KEY = script.getAttribute('data-partner-key') || '';
  var THEME = script.getAttribute('data-theme') || 'auto';
  var POSITION = script.getAttribute('data-position') || 'inline';
  var API_BASE = (script.getAttribute('data-api-base') || '').replace(/\/$/, '');
  var CONTAINER_SELECTOR = script.getAttribute('data-container') || '[data-gen3ia-recommend]';

  if (!PARTNER_KEY) {
    console.warn('[Gen3ia] data-partner-key manquant - widget desactive.');
    return;
  }

  var sessionId = null;
  var payload = null;

  function cssId() {
    return 'gen3ia-widget-css';
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fetchRecommend() {
    var url = API_BASE + '/api/public/recommend';
    return fetch(url, {
      method: 'GET',
      headers: { 'X-Partner-Key': PARTNER_KEY, Accept: 'application/json' },
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function track(eventType, extra) {
    if (!payload || !payload.attribution) return;
    var url = API_BASE + '/api/public/recommend/track';
    var body = { sessionId: sessionId, eventType: eventType, metadata: extra || {} };
    try {
      navigator.sendBeacon(url, new Blob([JSON.stringify(body)], { type: 'application/json' }));
    } catch (e) {
      fetch(url, {
        method: 'POST',
        headers: {
          'X-Partner-Key': PARTNER_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    }
  }

  function themeClass() {
    if (THEME === 'dark') return 'g3ia-dark';
    if (THEME === 'light') return 'g3ia-light';
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'g3ia-dark';
    return 'g3ia-light';
  }

  function injectCss() {
    if (document.getElementById(cssId())) return;
    var style = document.createElement('style');
    style.id = cssId();
    style.textContent = [
      '.g3ia-widget{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;max-width:340px;border-radius:16px;padding:20px;box-sizing:border-box;transition:opacity .3s ease,transform .3s ease;}',
      '.g3ia-widget.g3ia-light{background:linear-gradient(180deg,#ffffff,#f7f8fb);border:1px solid #e5e7eb;color:#111827;box-shadow:0 12px 32px rgba(17,24,39,.10);}',
      '.g3ia-widget.g3ia-dark{background:linear-gradient(180deg,#111827,#0b0f19);border:1px solid #1f2937;color:#f9fafb;box-shadow:0 12px 32px rgba(0,0,0,.4);}',
      '.g3ia-widget .g3ia-badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:999px;margin-bottom:12px;}',
      '.g3ia-light .g3ia-badge{background:#eef2ff;color:#4f46e5;}',
      '.g3ia-dark .g3ia-badge{background:#312e81;color:#c7d2fe;}',
      '.g3ia-widget h3{margin:0 0 6px;font-size:20px;line-height:1.25;font-weight:800;}',
      '.g3ia-widget .g3ia-tagline{margin:0 0 12px;font-size:14px;opacity:.85;}',
      '.g3ia-widget .g3ia-desc{margin:0 0 14px;font-size:13px;line-height:1.55;opacity:.75;}',
      '.g3ia-widget .g3ia-features{list-style:none;margin:0 0 16px;padding:0;}',
      '.g3ia-widget .g3ia-features li{font-size:12.5px;padding:3px 0 3px 20px;position:relative;opacity:.85;}',
      '.g3ia-widget .g3ia-features li:before{content:"\2713";position:absolute;left:0;color:#10b981;font-weight:700;}',
      '.g3ia-widget .g3ia-plans{display:flex;gap:8px;margin:0 0 16px;}',
      '.g3ia-widget .g3ia-plan{flex:1;border-radius:10px;padding:10px 8px;text-align:center;font-size:11.5px;}',
      '.g3ia-light .g3ia-plan{border:1px solid #e5e7eb;background:#f9fafb;}',
      '.g3ia-dark .g3ia-plan{border:1px solid #1f2937;background:#0f172a;}',
      '.g3ia-widget .g3ia-plan strong{display:block;font-size:13px;margin-bottom:2px;}',
      '.g3ia-widget .g3ia-cta{display:block;text-align:center;text-decoration:none;font-weight:700;font-size:14px;padding:12px 16px;border-radius:10px;transition:filter .2s ease;cursor:pointer;border:0;}',
      '.g3ia-widget .g3ia-cta:hover{filter:brightness(1.08);}',
      '.g3ia-light .g3ia-cta{background:#4f46e5;color:#fff;}',
      '.g3ia-dark .g3ia-cta{background:#6366f1;color:#fff;}',
      '.g3ia-widget .g3ia-note{margin-top:10px;font-size:10.5px;text-align:center;opacity:.55;}',
      '.g3ia-launcher{position:fixed;bottom:24px;right:24px;z-index:2147483000;background:#4f46e5;color:#fff;border:none;border-radius:999px;padding:14px 20px;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 10px 24px rgba(79,70,229,.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;}',
      '@media (max-width:480px){.g3ia-widget{max-width:100%;}}',
    ].join('\n');
    document.head.appendChild(style);
  }

  function buildCard() {
    var card = document.createElement('div');
    card.className = 'g3ia-widget ' + themeClass();

    var badge = document.createElement('span');
    badge.className = 'g3ia-badge';
    badge.textContent = 'Gen3ia';

    var h = document.createElement('h3');
    h.textContent = payload.product.name;

    var tag = document.createElement('p');
    tag.className = 'g3ia-tagline';
    tag.textContent = payload.product.tagline;

    var desc = document.createElement('p');
    desc.className = 'g3ia-desc';
    desc.textContent = payload.product.description;

    var ul = document.createElement('ul');
    ul.className = 'g3ia-features';
    (payload.features || []).slice(0, 5).forEach(function (f) {
      var li = document.createElement('li');
      li.textContent = f;
      ul.appendChild(li);
    });

    var plans = document.createElement('div');
    plans.className = 'g3ia-plans';
    (payload.plans || []).forEach(function (p) {
      var div = document.createElement('div');
      div.className = 'g3ia-plan';
      var strong = document.createElement('strong');
      strong.textContent = p.name;
      var span = document.createElement('span');
      span.textContent = p.price + ' ' + (p.period || '');
      div.appendChild(strong);
      div.appendChild(span);
      plans.appendChild(div);
    });

    var cta = document.createElement('a');
    cta.className = 'g3ia-cta';
    cta.href = payload.attribution.signupUrl || payload.cta.url;
    cta.target = '_blank';
    cta.rel = 'noopener noreferrer';
    cta.textContent = payload.cta.label;
    cta.addEventListener('click', function () {
      track('click', { label: payload.cta.label });
    });

    var note = document.createElement('p');
    note.className = 'g3ia-note';
    note.textContent = 'Recommandé par ' + (payload.attribution ? 'un partenaire Gen3ia' : '');

    card.appendChild(badge);
    card.appendChild(h);
    card.appendChild(tag);
    card.appendChild(desc);
    card.appendChild(ul);
    card.appendChild(plans);
    card.appendChild(cta);
    card.appendChild(note);
    return card;
  }

  function mount() {
    injectCss();
    var container = null;
    try {
      container = document.querySelector(CONTAINER_SELECTOR);
    } catch (e) {
      container = null;
    }
    if (!container) {
      container = document.createElement('div');
      container.setAttribute('data-gen3ia-recommend', '');
      document.body.appendChild(container);
    }
    var card = buildCard();
    container.appendChild(card);
  }

  function init() {
    fetchRecommend()
      .then(function (data) {
        payload = data;
        sessionId = payload.attribution ? payload.attribution.sessionId : null;
        mount();
        track('view', {});
      })
      .catch(function (err) {
        console.warn('[Gen3ia] Impossible de charger la recommandation:', err.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
