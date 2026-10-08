const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

test('formatNummer: polstert auf vier Stellen', () => {
  assert.equal(L.formatNummer(42, '2026-10-09T12:00:00Z'), '2026-0042');
  assert.equal(L.formatNummer(7, '2026-01-01T12:00:00Z'), '2026-0007');
  assert.equal(L.formatNummer(123456, '2026-10-09T12:00:00Z'), '2026-123456');
});

test('formatDatum: TT.MM.JJJJ', () => {
  assert.equal(L.formatDatum('2026-10-09T12:00:00Z'), '09.10.2026');
});

test('escapeHtml: maskiert alle gefährlichen Zeichen', () => {
  assert.equal(L.escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
  assert.equal(L.escapeHtml("Tom & 'Jerry'"), 'Tom &amp; &#39;Jerry&#39;');
});

test('validiereMeldung: trims, prüft Pflichtfeld und Grenzen', () => {
  const ok = L.validiereMeldung({ art: 'verloren', text: '  Hallo Welt  ' });
  assert.equal(ok.ok, true);
  assert.equal(ok.daten.text, 'Hallo Welt');
  assert.equal(ok.daten.name, null);
  assert.equal(ok.daten.kontakt, null);
  assert.equal(L.validiereMeldung({ art: 'verloren', text: 'ab' }).ok, false);
  assert.equal(L.validiereMeldung({ art: 'weg', text: 'Hallo Welt' }).ok, false);
  assert.equal(L.validiereMeldung({ art: 'verloren', text: 'Hallo', name: 'x'.repeat(61) }).ok, false);
  assert.equal(L.validiereMeldung({ art: 'verloren', text: 'Hallo', kontakt: 'x'.repeat(201) }).ok, false);
});

test('insertFuerText: Einfügen, Ersetzen, Mehrzeichen', () => {
  assert.deepEqual(L.insertFuerText('Hallo', 5, 5, '!'), { text: 'Hallo!', pos: 6 });
  assert.deepEqual(L.insertFuerText('Hallo Welt', 6, 10, 'du'), { text: 'Hallo du', pos: 8 });
  assert.deepEqual(L.insertFuerText('test', 0, 4, ''), { text: '', pos: 0 });
  assert.deepEqual(L.insertFuerText('Hallo', 99, 99, '!'), { text: 'Hallo!', pos: 6 }); // clamp
  assert.deepEqual(L.insertFuerText('Hallo ät', 5, 5, '…'), { text: 'Hallo… ät', pos: 6 });
});

test('loescheZurueck: löscht Auswahl oder Zeichen davor', () => {
  assert.deepEqual(L.loescheZurueck('Hallo', 5, 5), { text: 'Hall', pos: 4 });
  assert.deepEqual(L.loescheZurueck('Hallo', 2, 4), { text: 'Hlo', pos: 2 });
  assert.deepEqual(L.loescheZurueck('Hallo', 0, 0), { text: 'Hallo', pos: 0 });
});

test('istGueltigeKoordinate: akzeptiert nur endliche Werte im Bereich', () => {
  assert.equal(L.istGueltigeKoordinate(48.1, 11.5), true);
  assert.equal(L.istGueltigeKoordinate(null, 11), false);
  assert.equal(L.istGueltigeKoordinate('abc', 11), false);
  assert.equal(L.istGueltigeKoordinate(91, 11), false);
  assert.equal(L.istGueltigeKoordinate(48, 181), false);
});

test('fehlerText: freundliche Meldungen je Status', () => {
  assert.match(L.fehlerText(null), /Kabel zum Amt/);
  assert.match(L.fehlerText(401), /Schlüssel/);
  assert.match(L.fehlerText(500), /schiefgelaufen/);
});
