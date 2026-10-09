/* Digitales Fundbüro — Ende-zu-Ende-Verschlüsselung (WebCrypto).
   Hybrid: AES-GCM für die Nachricht, der Sitzungsschlüssel wird mit dem
   RSA-OAEP-Public-Key des Posters verpackt. Der private Schlüssel lebt NUR
   im geheimen Link (URL-#-Fragment) und im Browser des Posters — niemals
   auf dem Server. Kein externer Dienst, keine Bibliothek.

   Öffentliche API (Promises):
     FundbueroKrypto.erzeugePaar()            -> { publicB64, privatB64 }
     FundbueroKrypto.verschluessle(pub, obj)  -> Promise<string  (JSON-Hülle)
     FundbueroKrypto.entschluessle(priv, str) -> Promise<obj>
   Base64 durchgängig URL-sicher (fürs URL-Fragment), Padding-tolerant. */

(function (root) {
  'use strict';

  function unterstuetzt() {
    return typeof crypto !== 'undefined' && crypto.subtle &&
      typeof crypto.subtle.generateKey === 'function' &&
      typeof crypto.getRandomValues === 'function';
  }

  // Uint8Array <-> URL-sicheres Base64
  function b64(buf) {
    var bytes = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < bytes.length; i++) { s += String.fromCharCode(bytes[i]); }
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function unb64(text) {
    var s = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) { s += '='; }
    var roh = atob(s);
    var bytes = new Uint8Array(roh.length);
    for (var i = 0; i < roh.length; i++) { bytes[i] = roh.charCodeAt(i); }
    return bytes;
  }

  function erzeugePaar() {
    if (!unterstuetzt()) { return Promise.reject(new Error('kein WebCrypto')); }
    return crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['encrypt', 'decrypt']
    ).then(function (paar) {
      return Promise.all([
        crypto.subtle.exportKey('spki', paar.publicKey),
        crypto.subtle.exportKey('pkcs8', paar.privateKey)
      ]);
    }).then(function (schluessel) {
      return { publicB64: b64(schluessel[0]), privatB64: b64(schluessel[1]) };
    });
  }

  function verschluessle(pubB64, objekt) {
    if (!unterstuetzt()) { return Promise.reject(new Error('kein WebCrypto')); }
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var klartext = new TextEncoder().encode(JSON.stringify(objekt || {}));

    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
      .then(function (aes) {
        return Promise.all([
          crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, aes, klartext),
          crypto.subtle.exportKey('raw', aes)
        ]);
      })
      .then(function (teile) {
        return crypto.subtle.importKey(
          'spki', unb64(pubB64), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']
        ).then(function (pub) {
          return crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, teile[1]);
        }).then(function (verpackt) {
          return JSON.stringify({
            v: 1,
            iv: b64(iv),
            ct: b64(teile[0]),
            key: b64(verpackt)
          });
        });
      });
  }

  function entschluessle(privatB64, inhalt) {
    if (!unterstuetzt()) { return Promise.reject(new Error('kein WebCrypto')); }
    var huelle;
    try { huelle = JSON.parse(inhalt); } catch (e) { return Promise.reject(new Error('format')); }
    if (!huelle || huelle.v !== 1 || !huelle.iv || !huelle.ct || !huelle.key) {
      return Promise.reject(new Error('format'));
    }

    return crypto.subtle.importKey(
      'pkcs8', unb64(privatB64), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']
    ).then(function (priv) {
      return crypto.subtle.decrypt({ name: 'RSA-OAEP' }, priv, unb64(huelle.key));
    }).then(function (sitzung) {
      return crypto.subtle.importKey('raw', sitzung, { name: 'AES-GCM' }, false, ['decrypt']);
    }).then(function (aes) {
      return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(huelle.iv) }, aes, unb64(huelle.ct)
      );
    }).then(function (klar) {
      return JSON.parse(new TextDecoder().decode(klar));
    });
  }

  root.FundbueroKrypto = {
    unterstuetzt: unterstuetzt,
    erzeugePaar: erzeugePaar,
    verschluessle: verschluessle,
    entschluessle: entschluessle
  };
})(typeof self !== 'undefined' ? self : this);
