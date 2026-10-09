/* Digitales Fundbüro — bunte Custom-Icons (ersetzen die Emojis).
   Statisch: <span class="ico" data-ico="brief" data-ico-groesse="16"></span>
   Dynamisch: FundbueroIcons.baue('brief', 16) -> <span class="ico">…</span>
   Alle SVG-Strings sind statisch (kein Nutzerinhalt) — innerHTML hier sicher. */

(function (root) {
  'use strict';

  var ICONS = {
    lupe:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10" cy="10" r="6" fill="#eaf4ff" stroke="#1d5eb8" stroke-width="2.5"/>' +
      '<line x1="14.7" y1="14.7" x2="20" y2="20" stroke="#1d5eb8" stroke-width="3.4" stroke-linecap="round"/>' +
      '<path d="M6.5 8.2a4.5 4.5 0 0 1 2.6-2.4" stroke="#ffffff" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '</svg>',

    brief:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="2.5" y="5" width="19" height="14" rx="2" fill="#fff6d8" stroke="#e07a00" stroke-width="2"/>' +
      '<path d="M3.6 7.2 12 13l8.4-5.8" fill="none" stroke="#e07a00" stroke-width="2"/>' +
      '<path d="M3.6 17.2 9.4 12M20.4 17.2 14.6 12" stroke="#e0b050" stroke-width="1.4" fill="none"/>' +
      '</svg>',

    postfach:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 20V11a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v9z" fill="#cfe3ff" stroke="#1d5eb8" stroke-width="2"/>' +
      '<rect x="7.5" y="8.5" width="9" height="6.5" rx="1.4" fill="#eef6ff" stroke="#1d5eb8" stroke-width="1.6"/>' +
      '<path d="M17 5h-4V3h4z" fill="#e0342a"/>' +
      '<line x1="2.5" y1="20" x2="21.5" y2="20" stroke="#1d5eb8" stroke-width="2.2" stroke-linecap="round"/>' +
      '</svg>',

    megafon:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 10v4l2.2.6V20h3.2v-4.7l9 2.9V5.8L6.2 9.4z" fill="#ffd200" stroke="#e07a00" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<path d="M20.5 9.5v5" stroke="#e07a00" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>',

    maske:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 2.8c-3.6 0-5.6 2-6.1 5h12.2c-.5-3-2.5-5-6.1-5z" fill="#7a3fd1"/>' +
      '<path d="M3.6 11h16.8v1.6a3.4 3.4 0 0 1-3.4 3.4h-1.6l-3.4 2.2L8.6 16H7a3.4 3.4 0 0 1-3.4-3.4z" fill="#c9a2ff" stroke="#7a3fd1" stroke-width="1.7" stroke-linejoin="round"/>' +
      '<circle cx="8.6" cy="12.6" r="1.4" fill="#4a1f8f"/><circle cx="15.4" cy="12.6" r="1.4" fill="#4a1f8f"/>' +
      '</svg>',

    pin:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z" fill="#e0342a" stroke="#ffffff" stroke-width="2"/>' +
      '<circle cx="12" cy="9" r="2.6" fill="#ffffff"/>' +
      '</svg>',

    ziel:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="12" cy="12" r="8.5" fill="#ffffff" stroke="#e0342a" stroke-width="2.4"/>' +
      '<circle cx="12" cy="12" r="4.6" fill="#ffffff" stroke="#e0342a" stroke-width="2.4"/>' +
      '<circle cx="12" cy="12" r="1.6" fill="#e0342a"/>' +
      '</svg>',

    kreis:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="12" cy="12" r="7.8" fill="#e8f1ff" stroke="#2a68c4" stroke-width="2.4" stroke-dasharray="3.6 2.8"/>' +
      '<circle cx="12" cy="12" r="2" fill="#2a68c4"/>' +
      '</svg>',

    refresh:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M19 12a7 7 0 1 1-2.2-5.1" fill="none" stroke="#2a68c4" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M17.6 2.6l.6 5.4-5.2-.8z" fill="#1fa53c"/>' +
      '</svg>',

    muell:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M6.5 7.5h11l-1.1 12.7a1.6 1.6 0 0 1-1.6 1.3H9.2a1.6 1.6 0 0 1-1.6-1.3z" fill="#ffe3e0" stroke="#b00000" stroke-width="1.8"/>' +
      '<path d="M4 7h16M10 7V4h4v3" fill="none" stroke="#b00000" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M10 11v7M14 11v7" stroke="#d98f86" stroke-width="1.6" stroke-linecap="round"/>' +
      '</svg>',

    clipboard:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="6" y="4" width="12" height="17" rx="2" fill="#ffffff" stroke="#1d5eb8" stroke-width="2"/>' +
      '<rect x="9" y="2.4" width="6" height="4" rx="1.2" fill="#cfe3ff" stroke="#1d5eb8" stroke-width="1.6"/>' +
      '<path d="M9 11.5h6M9 15.5h6" stroke="#1d5eb8" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>',

    schluessel:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="8" cy="12" r="4.6" fill="#fff6d8" stroke="#e07a00" stroke-width="2.4"/>' +
      '<circle cx="8" cy="12" r="1.4" fill="#e07a00"/>' +
      '<path d="M12.6 12H21M18 12v3.4M15 12v2.4" fill="none" stroke="#e07a00" stroke-width="2.4" stroke-linecap="round"/>' +
      '</svg>',

    karte:
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M3 6.2 9 4l6 2.2L21 4v13.8L15 20l-6-2.2L3 20z" fill="#e8f1ff" stroke="#1d5eb8" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M9 4v13.8M15 6.2V20" stroke="#1d5eb8" stroke-width="1.5"/>' +
      '<circle cx="6.2" cy="10" r="1" fill="#e0342a"/><circle cx="17.8" cy="12.5" r="1" fill="#1fa53c"/>' +
      '</svg>'
  };

  // <span class="ico"> mit SVG füllen — für statische Platzhalter.
  function baue(name, groesse) {
    var span = document.createElement('span');
    span.className = 'ico';
    span.setAttribute('aria-hidden', 'true');
    if (ICONS[name]) {
      span.innerHTML = ICONS[name];
      var svg = span.firstChild;
      var g = groesse || 16;
      svg.setAttribute('width', String(g));
      svg.setAttribute('height', String(g));
    }
    return span;
  }

  // Alle [data-ico]-Platzhalter im Dokument füllen.
  function ersetzeIcons(wurzel) {
    var ziel = wurzel || document;
    var platzhalter = ziel.querySelectorAll ? ziel.querySelectorAll('[data-ico]') : [];
    Array.prototype.forEach.call(platzhalter, function (el) {
      var name = el.getAttribute('data-ico');
      if (!ICONS[name] || el.firstChild) { return; }
      el.innerHTML = ICONS[name];
      var svg = el.firstChild;
      var g = el.getAttribute('data-ico-groesse') || '16';
      svg.setAttribute('width', g);
      svg.setAttribute('height', g);
    });
  }

  root.FundbueroIcons = { baue: baue, ersetzeIcons: ersetzeIcons, liste: Object.keys(ICONS) };

  function start() { ersetzeIcons(document); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof self !== 'undefined' ? self : this);
