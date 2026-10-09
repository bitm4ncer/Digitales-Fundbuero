// Kontakt-Relay — „✉️ Antworten" auf eine Meldung.
//
// Schickt die Nachricht eines Antwortenden per Brevo-E-Mail an die Person,
// die die Meldung eingetragen hat. Die Kontaktdaten des Posters verlassen
// die Datenbank nie in Richtung Browser; die Adresse des Antwortenden wird
// als Reply-To mitgeschickt (direkte Antwort möglich).
//
// Benötigte Secrets (Supabase → Edge Functions → Secrets):
//   BREVO_API_KEY   — aus Brevo: Settings → SMTP & API → API Keys
//   MAIL_FROM       — verifizierter Absender, z. B. kontakt@jannesbecherer.de
//   MAIL_FROM_NAME  — Anzeigename (optional, Default „Digitales Fundbüro")
//   IP_HASH_SALT    — beliebiger Zufalls-String (für gehashte IPs im Log)
//   SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzt Supabase automatisch.
//
// Deploy: Edge Functions → „kontakt-relay" → Code einfügen, JWT-Prüfung AUS.
// (Die neuen Publishable Keys sind keine JWTs — ohne abgeschaltete
// JWT-Prüfung würde das Gateway alle Aufrufe abweisen.)

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function istGueltigeEmail(text: string): boolean {
  const wert = String(text || '').trim();
  return wert.length >= 5 && wert.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wert);
}

async function sha256Hex(text: string): Promise<string> {
  const daten = new TextEncoder().encode(text);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', daten));
  return Array.from(hash).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ fehler: 'Nur POST, bitte.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const brevoKey = Deno.env.get('BREVO_API_KEY') ?? '';
  const mailFrom = Deno.env.get('MAIL_FROM') ?? '';
  const mailFromName = Deno.env.get('MAIL_FROM_NAME') ?? 'Digitales Fundbüro';
  const salt = Deno.env.get('IP_HASH_SALT') ?? 'fundbuero';

  if (!supabaseUrl || !serviceKey || !brevoKey || !mailFrom) {
    return json({ fehler: 'Das Amt ist noch nicht ganz eingerichtet (Secrets fehlen).' }, 500);
  }

  let daten: Record<string, unknown>;
  try {
    daten = await req.json();
  } catch {
    return json({ fehler: 'Bitte als JSON senden.' }, 400);
  }

  const meldungId = Number(daten.meldung_id);
  const absenderEmail = String(daten.absender_email ?? '').trim();
  const absenderName = String(daten.absender_name ?? '').trim().slice(0, 60);
  const nachricht = String(daten.nachricht ?? '').trim();
  const honig = String(daten.website ?? '').trim();

  // Honigtopf: Bots füllen das unsichtbare Feld — still „Erfolg" melden.
  if (honig !== '') {
    return json({ ok: true });
  }

  if (!Number.isInteger(meldungId) || meldungId <= 0) {
    return json({ fehler: 'Diese Meldung kenne ich nicht.' }, 400);
  }
  if (!istGueltigeEmail(absenderEmail)) {
    return json({ fehler: 'Bitte gib eine gültige E-Mail an.' }, 400);
  }
  if (nachricht.length < 3 || nachricht.length > 1000) {
    return json({ fehler: 'Die Nachricht muss zwischen 3 und 1000 Zeichen lang sein.' }, 400);
  }

  const kopf = {
    apikey: serviceKey,
    Authorization: 'Bearer ' + serviceKey,
    'Content-Type': 'application/json',
  };

  // Rate-Limit: höchstens 3 Anfragen pro IP-Kennung und Stunde.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unbekannt';
  const ipHash = await sha256Hex(salt + '|' + ip);
  const seit = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  try {
    const limitAntwort = await fetch(
      `${supabaseUrl}/rest/v1/kontakt_anfragen?select=id&ip_hash=eq.${encodeURIComponent(ipHash)}` +
        `&created_at=gte.${encodeURIComponent(seit)}&limit=4`,
      { headers: kopf },
    );
    const bisher = limitAntwort.ok ? await limitAntwort.json() : [];
    if (Array.isArray(bisher) && bisher.length >= 3) {
      return json(
        { fehler: 'Zu viele Anfragen — bitte warte eine Stunde und versuch es dann nochmal.' },
        429,
      );
    }

    // Meldung samt privatem Kontakt laden (service_role darf die Spalte lesen).
    const meldungAntwort = await fetch(
      `${supabaseUrl}/rest/v1/meldungen?id=eq.${meldungId}&select=id,art,text,name,kontakt&limit=1`,
      { headers: kopf },
    );
    const treffer = meldungAntwort.ok ? await meldungAntwort.json() : [];
    const meldung = Array.isArray(treffer) ? treffer[0] : null;
    if (!meldung) {
      return json({ fehler: 'Diese Meldung gibt es nicht (mehr).' }, 404);
    }
    if (!meldung.kontakt || String(meldung.kontakt).trim() === '') {
      return json(
        { fehler: 'Für diese Meldung ist kein Kontakt hinterlegt — da kann ich leider nichts weiterleiten.' },
        409,
      );
    }

    // Privates Protokoll (Missbrauchs-Abwehr); Fehler hier blockieren nicht.
    await fetch(`${supabaseUrl}/rest/v1/kontakt_anfragen`, {
      method: 'POST',
      headers: { ...kopf, Prefer: 'return=minimal' },
      body: JSON.stringify({
        meldung_id: meldungId,
        absender: absenderEmail + (absenderName ? ' (' + absenderName + ')' : ''),
        nachricht,
        ip_hash: ipHash,
      }),
    });

    // Mail über Brevo an den Poster; Reply-To = Absender.
    const artText = meldung.art === 'gefunden'
      ? 'GEFUNDEN'
      : (meldung.art === 'verschenken' ? 'VERSCHENKEN' : 'VERLOREN');
    const kurztext = String(meldung.text ?? '').slice(0, 120);

    const emailAntwort = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { email: mailFrom, name: mailFromName },
        to: [{ email: String(meldung.kontakt).trim() }],
        replyTo: { email: absenderEmail, name: absenderName || absenderEmail },
        subject: `Antwort auf deine Meldung Nr. ${meldungId}: „${kurztext}“`,
        htmlContent:
          '<p>Hallo!</p>' +
          `<p>Jemand hat auf deine Meldung <b>Nr. ${meldungId}</b> (${artText}) geantwortet:</p>` +
          '<blockquote style="border-left:3px solid #2a68c4;margin:0;padding:6px 12px;color:#123a75;">' +
          escapeHtml(nachricht).replace(/\n/g, '<br>') +
          '</blockquote>' +
          `<p><b>Antworte einfach direkt auf diese E-Mail</b> — sie geht dann an ${escapeHtml(absenderEmail)}.</p>` +
          `<p style="color:#5b6c86;font-size:12px;">— Digitales Fundbüro · Antwort auf Nr. ${meldungId}</p>`,
      }),
    });

    if (!emailAntwort.ok) {
      const fehlerText = await emailAntwort.text();
      console.error('Brevo-Fehler:', emailAntwort.status, fehlerText.slice(0, 300));
      return json({ fehler: 'Die Post ist gerade unterwegs verloren gegangen. Gleich nochmal probieren!' }, 502);
    }

    return json({ ok: true });
  } catch (fehler) {
    console.error('kontakt-relay Fehler:', fehler);
    return json({ fehler: 'Mist, das Kabel zum Amt ist verstopft. Nochmal versuchen?' }, 500);
  }
});
