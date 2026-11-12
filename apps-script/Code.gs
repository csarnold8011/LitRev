/**
 * Szakirodalom-feldolgozó / Literature Review Tool: központi Apps Script háttér
 *
 * Egy Google táblázathoz kötve fut (pl. "Szakirodalom-feldolgozó adatok"). Lapjai:
 *   Felhasznalok  email | név | szerep | aktív | jelszó-hash | regisztrált | utolsó belépés
 *   Temak         id | cím | leírás | képzés | témavezető | aktív | létrehozva
 *   Tagok         téma | email | hozzáadva | hozzáadta
 *   Meghivok      token-hash | email | téma | típus | lejár | lejár-ms | felhasználva | létrehozta | létrehozva
 *   Cikkek        id | téma | Feldolgozó | ... | a sablon mezői
 *
 * Szerepek:
 *   témavezető  témavezetői kóddal regisztrál, témákat hoz létre, hallgatókat hív meg e-mail címmel,
 *               a saját témái feldolgozásait látja és értékeli.
 *   hallgató    meghívó linkkel regisztrál (saját jelszóval), a témái feldolgozásait írja és olvassa.
 *
 * Belépés: e-mail + jelszó. A jelszó csak sózott hash-ként tárolódik. Sikeres belépés után a böngésző
 * egy aláírt, időkorlátos belépési kulcsot kap, amely jelszócserekor azonnal érvénytelenné válik.
 *
 * A táblázat "Szakirodalom-feldolgozó" menüje: témavezetői kód, jelszó-visszaállító link, áttekintés.
 */

// A GitHub Pages oldal címe, perjellel a végén. Csak a menüben készített jelszó-visszaállító linkhez kell.
// Példa: 'https://csarnold8011.github.io/LitRev/'
const OLDAL_URL = 'https://csarnold8011.github.io/LitRev/';

const BELEPES_NAP = 14;      // ennyi napig érvényes egy belépés
const MEGHIVO_NAP = 30;      // ennyi napig érvényes egy hallgatói meghívó link
const VISSZAALLITO_NAP = 7;  // ennyi napig érvényes egy jelszó-visszaállító link
const HIBA_LIMIT = 10;       // ennyi hibás próbálkozás után ideiglenes zárolás
const HIBA_PERC = 15;        // a zárolás hossza percben
const HASH_KOR = 500;        // a jelszó-hash ismétlésszáma
const MIN_JELSZO = 8;
const MAX_HALLGATO = 20;     // egy témához egyszerre felvehető hallgatók száma

const L = { USER: 'Felhasznalok', TOPIC: 'Temak', MEMBER: 'Tagok', INVITE: 'Meghivok', REC: 'Cikkek' };
const REC_META = ['id', 'téma', 'Feldolgozó', 'Feldolgozó e-mail', 'Létrehozva', 'Módosítva', 'Utoljára módosította',
  'Állapot', 'Témavezetői megjegyzés', 'Megjegyzés ideje', 'Törölve'];
const FEJ = {
  Felhasznalok: ['email', 'név', 'szerep', 'aktív', 'jelszó-hash', 'regisztrált', 'utolsó belépés'],
  Temak: ['id', 'cím', 'leírás', 'képzés', 'témavezető', 'aktív', 'létrehozva'],
  Tagok: ['téma', 'email', 'hozzáadva', 'hozzáadta'],
  Meghivok: ['token-hash', 'email', 'téma', 'típus', 'lejár', 'lejár-ms', 'felhasználva', 'létrehozta', 'létrehozva'],
  Cikkek: REC_META
};
const SZEREP_TV = 'témavezető';
const SZEREP_H = 'hallgató';
const TIPUS_MEGHIVO = 'meghívó';
const TIPUS_JELSZO = 'jelszó';
const ALLAPOTOK = ['piszkozat', 'beadva', 'javítandó', 'elfogadva'];
const KEPZESEK = ['BSc', 'MSc', 'egyéb'];

let MEMO = {};

/* ===================== Beállítás és menü ===================== */

/** Egyszer futtasd le a szerkesztőből: engedélyeket kér, létrehozza a lapokat. */
function elsoBeallitas() {
  const ss = SpreadsheetApp.getActive();
  const lapok = ss.getSheets();
  if (lapok.length === 1 && lapok[0].getLastRow() === 0 && !ss.getSheetByName(L.USER)) lapok[0].setName(L.USER);
  Object.keys(FEJ).forEach(lapFej);
  titok();
  Logger.log('Kész. Töltsd újra a táblázatot: megjelenik a Szakirodalom-feldolgozó menü. Állítsd be a témavezetői kódot.');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Szakirodalom-feldolgozó')
    .addItem('Témavezetői regisztrációs kód beállítása', 'tvKodBeallitas')
    .addItem('Jelszó-visszaállító link készítése', 'visszaallitoLink')
    .addSeparator()
    .addItem('Áttekintés', 'attekintes')
    .addToUi();
}

function tvKodBeallitas() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Témavezetői regisztrációs kód',
    'Ezzel a kóddal regisztrálhatnak a kollégák témavezetőként (legalább 6 karakter). ' +
    'A korábbi kód ezzel érvényét veszti, a már regisztrált témavezetőket nem érinti.\n' +
    'Ha üresen hagyod, a témavezetői regisztráció kikapcsol.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const kod = r.getResponseText().trim();
  const pr = PropertiesService.getScriptProperties();
  if (!kod) {
    pr.deleteProperty('TV_KOD');
    ui.alert('A témavezetői regisztráció kikapcsolva. A már regisztrált témavezetők továbbra is beléphetnek.');
    return;
  }
  if (kod.length < 6) { ui.alert('A kód legalább 6 karakter legyen. Nem változott semmi.'); return; }
  pr.setProperty('TV_KOD', hashJelszo(kod));
  ui.alert('Kész. Ezt a kódot add át a témavezetőknek (a kód csak hash-ként tárolódik, később nem olvasható vissza).');
}

function visszaallitoLink() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Jelszó-visszaállító link', 'A felhasználó e-mail címe:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const email = normEmail(r.getResponseText());
  const u = felhasznalo(email);
  if (!u) { ui.alert('Nincs ilyen e-mail című felhasználó a Felhasznalok lapon.'); return; }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let m;
  try {
    meghivokVisszavon(email, null);
    m = meghivoKeszit(email, '', TIPUS_JELSZO, 'adminisztrátor', VISSZAALLITO_NAP);
  } finally { lock.releaseLock(); }
  ui.alert('Jelszó-visszaállító link',
    'Küldd el ezt a linket ' + email + ' címre. ' + VISSZAALLITO_NAP + ' napig érvényes, egyszer használható:\n\n' +
    (OLDAL_URL || '[a GitHub Pages oldal címe]/') + '#invite=' + m.token +
    (OLDAL_URL ? '' : '\n\n(Az OLDAL_URL nincs kitöltve a kód elején, ezért az oldal címét neked kell a link elé írnod.)'),
    ui.ButtonSet.OK);
}

function attekintes() {
  const us = tabla(L.USER).sorok, ts = temak(), ms = tagok();
  const rs = tabla(L.REC).sorok.filter(function (r) { return !r['Törölve']; });
  const tvk = us.filter(tvE).length;
  const sorok = ts.map(function (t) {
    const tv = felhasznalo(t.tv);
    const n = rs.filter(function (r) { return String(r['téma']) === t.id; }).length;
    const h = ms.filter(function (m) { return m.tema === t.id; }).length;
    return t.id + '  ' + t.cim + '\n   témavezető: ' + (tv ? tv['név'] : t.tv) + ', hallgatók: ' + h + ', feldolgozások: ' + n + (t.aktiv ? '' : ' (lezárva)');
  });
  const kod = PropertiesService.getScriptProperties().getProperty('TV_KOD') ? 'be van állítva' : 'NINCS beállítva (témavezetői regisztráció kikapcsolva)';
  SpreadsheetApp.getUi().alert('Áttekintés',
    'Felhasználók: ' + us.length + ' (ebből témavezető: ' + tvk + ')\nTémák: ' + ts.length +
    '\nFeldolgozások: ' + rs.length + '\nTémavezetői kód: ' + kod + '\n\n' + sorok.join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/* ===================== Webalkalmazás ===================== */

function doGet() {
  return valasz({ ok: true, uzenet: 'A Szakirodalom-feldolgozó szervere működik.', ido: most() });
}

const NYILT = { login: belepes, registerSupervisor: tvRegisztracio, inviteInfo: meghivoInfo, acceptInvite: meghivoElfogad };
const VEDETT = {
  getAll: mindent, saveRecord: rekordMent, deleteRecord: rekordTorol, review: ertekeles,
  topicSave: temaMent, memberAdd: tagHozzaadAkcio, memberRemove: tagTorol, inviteNew: ujMeghivo,
  changePassword: jelszoCsere, profile: profilMent
};
const IRO = ['registerSupervisor', 'acceptInvite', 'saveRecord', 'deleteRecord', 'review', 'topicSave',
  'memberAdd', 'memberRemove', 'inviteNew', 'changePassword', 'profile'];

function doPost(e) {
  let b;
  try {
    b = JSON.parse(e.postData.contents);
  } catch (err) {
    return valasz({ ok: false, code: 'BADREQ', error: 'A kérés nem értelmezhető.' });
  }
  MEMO = {};
  const akcio = String(b.action || '');
  const fv = NYILT[akcio] || VEDETT[akcio];
  if (!fv) return valasz({ ok: false, code: 'BADREQ', error: 'Ismeretlen művelet.' });
  let lock = null;
  try {
    if (IRO.indexOf(akcio) >= 0) {
      lock = LockService.getScriptLock();
      lock.waitLock(20000);
      MEMO = {};
    }
    const eredmeny = NYILT[akcio] ? fv(b) : fv(belepesEllenoriz(b.token), b);
    return valasz(Object.assign({ ok: true }, eredmeny));
  } catch (err) {
    if (err && err.kod) return valasz({ ok: false, code: err.kod, error: err.message });
    return valasz({ ok: false, code: 'SERVER', error: String((err && err.message) || err) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function valasz(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hiba(kod, uzenet) {
  const e = new Error(uzenet);
  e.kod = kod;
  return e;
}

/* ===================== Belépés és regisztráció ===================== */

function probalkozas(kulcs) {
  const cache = CacheService.getScriptCache();
  const ck = 'hiba_' + String(kulcs).slice(0, 200);
  const n = Number(cache.get(ck) || 0);
  if (n >= HIBA_LIMIT) throw hiba('LOCKED', 'Túl sok sikertelen próbálkozás. Próbáld újra ' + HIBA_PERC + ' perc múlva.');
  return {
    hibas: function () { cache.put(ck, String(n + 1), HIBA_PERC * 60); },
    jo: function () { cache.remove(ck); }
  };
}

function belepes(b) {
  const email = normEmail(b.email);
  const jelszo = String(b.jelszo || '');
  if (!email || !jelszo) throw hiba('BADREQ', 'Add meg az e-mail címet és a jelszót.');
  const p = probalkozas('be_' + email);
  const u = felhasznalo(email);
  const jo = !!(u && igaz(u['aktív']) && u['jelszó-hash'] && jelszoEllenoriz(jelszo, u['jelszó-hash']));
  if (!jo) {
    p.hibas();
    Utilities.sleep(700);
    throw hiba('LOGIN', 'Hibás e-mail cím vagy jelszó.');
  }
  p.jo();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    MEMO = {};
    const friss = felhasznalo(email);
    sorIr(L.USER, { 'utolsó belépés': most() }, friss._sor);
  } finally { lock.releaseLock(); }
  return belepesValasz(u);
}

function belepesValasz(u) {
  const t = belepesiKulcs(u);
  return { token: t.token, lejar: t.lejar, user: userKi(u) };
}

function userKi(u) {
  return { email: normEmail(u.email), nev: String(u['név'] || ''), szerep: tvE(u) ? 'tv' : 'h' };
}

function tvRegisztracio(b) {
  const tarolt = PropertiesService.getScriptProperties().getProperty('TV_KOD');
  if (!tarolt) throw hiba('NOCODE', 'A témavezetői regisztráció jelenleg nincs bekapcsolva. Szólj az adminisztrátornak.');
  const p = probalkozas('tvkod');
  if (!jelszoEllenoriz(String(b.kod || '').trim(), tarolt)) {
    p.hibas();
    Utilities.sleep(700);
    throw hiba('CODE', 'Hibás témavezetői regisztrációs kód.');
  }
  const email = normEmail(b.email), nev = tisztaNev(b.nev), jelszo = String(b.jelszo || '');
  if (!emailJo(email)) throw hiba('EMAIL', 'Érvénytelen e-mail cím.');
  if (!nev) throw hiba('NAME', 'Add meg a neved.');
  if (jelszo.length < MIN_JELSZO) throw hiba('PASSWORD', 'A jelszó legalább ' + MIN_JELSZO + ' karakter legyen.');
  if (felhasznalo(email)) throw hiba('EXISTS', 'Ezzel az e-mail címmel már van fiók. Lépj be vele.');
  const ido = most();
  sorIr(L.USER, {
    'email': email, 'név': nev, 'szerep': SZEREP_TV, 'aktív': 'igen',
    'jelszó-hash': hashJelszo(jelszo), 'regisztrált': ido, 'utolsó belépés': ido
  });
  return belepesValasz(felhasznalo(email));
}

function meghivoInfo(b) {
  const m = meghivoKeres(b.meghivo);
  const u = felhasznalo(m.email);
  const t = m.tema ? temaKeres(m.tema) : null;
  const tv = t ? felhasznalo(t.tv) : null;
  return {
    meghivo: {
      email: m.email, tipus: m.tipus === TIPUS_JELSZO ? 'reset' : 'invite',
      nev: u ? String(u['név'] || '') : '',
      vanFiok: !!(u && u['jelszó-hash']),
      tema: t ? { cim: t.cim, kepzes: t.kepzes } : null,
      temavezeto: tv ? String(tv['név'] || '') : ''
    }
  };
}

function meghivoElfogad(b) {
  const m = meghivoKeres(b.meghivo);
  const jelszo = String(b.jelszo || '');
  if (jelszo.length < MIN_JELSZO) throw hiba('PASSWORD', 'A jelszó legalább ' + MIN_JELSZO + ' karakter legyen.');
  const u = felhasznalo(m.email);
  const ido = most();
  if (m.tipus === TIPUS_JELSZO) {
    if (!u) throw hiba('INVITE', 'A link érvénytelen.');
    if (!igaz(u['aktív'])) throw hiba('LOGIN', 'A fiók ki van kapcsolva. Szólj az adminisztrátornak.');
    const ert = { 'jelszó-hash': hashJelszo(jelszo), 'utolsó belépés': ido };
    const nev = tisztaNev(b.nev);
    if (nev) ert['név'] = nev;
    sorIr(L.USER, ert, u._sor);
  } else {
    if (u && u['jelszó-hash']) throw hiba('EXISTS', 'Ezzel az e-mail címmel már van fiók. Lépj be a jelszavaddal, a téma ott lesz a listádban.');
    const nev = tisztaNev(b.nev);
    if (!nev) throw hiba('NAME', 'Add meg a neved.');
    const ert = { 'email': m.email, 'név': nev, 'szerep': SZEREP_H, 'aktív': 'igen', 'jelszó-hash': hashJelszo(jelszo), 'regisztrált': ido, 'utolsó belépés': ido };
    if (u) { delete ert['szerep']; sorIr(L.USER, ert, u._sor); } else sorIr(L.USER, ert);
    if (m.tema && temaKeres(m.tema) && !tagE(m.tema, m.email)) {
      sorIr(L.MEMBER, { 'téma': m.tema, 'email': m.email, 'hozzáadva': ido, 'hozzáadta': m.letrehozta });
    }
  }
  sorIr(L.INVITE, { 'felhasználva': ido }, m.sor);
  return belepesValasz(felhasznalo(m.email));
}

/* ===================== Belépési kulcs ===================== */

function belepesiKulcs(u) {
  const lejar = Date.now() + BELEPES_NAP * 24 * 3600 * 1000;
  const adat = normEmail(u.email) + '|' + lejar;
  return { token: Utilities.base64EncodeWebSafe(adat) + '.' + alairas(adat, u['jelszó-hash']), lejar: lejar };
}

// Az aláírásba a jelszó-hash vége is belekerül, így jelszócserekor minden régi belépés érvénytelen lesz.
function alairas(adat, hash) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(adat + '|' + String(hash).slice(-24), titok()));
}

function belepesEllenoriz(token) {
  const t = String(token || '').split('.');
  if (t.length !== 2) throw hiba('AUTH', 'Jelentkezz be.');
  let adat;
  try {
    adat = Utilities.newBlob(Utilities.base64DecodeWebSafe(t[0])).getDataAsString();
  } catch (e) {
    throw hiba('AUTH', 'Érvénytelen belépés, jelentkezz be újra.');
  }
  const r = adat.split('|');
  const u = felhasznalo(r[0]);
  if (!u || !igaz(u['aktív']) || !u['jelszó-hash']) throw hiba('AUTH', 'A fiók nem érhető el. Jelentkezz be újra.');
  if (!egyenlo(alairas(adat, u['jelszó-hash']), t[1])) throw hiba('AUTH', 'A belépés már nem érvényes (például jelszócsere miatt). Jelentkezz be újra.');
  if (!(Number(r[1]) > Date.now())) throw hiba('AUTH', 'A belépés lejárt, jelentkezz be újra.');
  return u;
}

function titok() {
  const pr = PropertiesService.getScriptProperties();
  let t = pr.getProperty('TITOK');
  if (!t) {
    t = Utilities.getUuid() + Utilities.getUuid();
    pr.setProperty('TITOK', t);
  }
  return t;
}

/* ===================== Adatlekérés ===================== */

function mindent(u) {
  const en = normEmail(u.email);
  const ts = temak(), ms = tagok(), us = tabla(L.USER).sorok;
  const fiok = function (email) { return us.filter(function (x) { return normEmail(x.email) === email; })[0] || null; };
  const most_ = Date.now();
  const fuggo = tabla(L.INVITE).sorok.filter(function (m) {
    return !m['felhasználva'] && Number(m['lejár-ms']) > most_ && m['típus'] === TIPUS_MEGHIVO;
  });
  const lathato = ts.filter(function (t) { return t.tv === en || ms.some(function (m) { return m.tema === t.id && m.email === en; }); });
  const ids = lathato.map(function (t) { return t.id; });

  const temaLista = lathato.map(function (t) {
    const sajat = t.tv === en;
    const tv = fiok(t.tv);
    const tagLista = ms.filter(function (m) { return m.tema === t.id; }).map(function (m) {
      const f = fiok(m.email);
      const regisztralt = !!(f && f['jelszó-hash']);
      const o = { nev: f ? String(f['név'] || '') : '', regisztralt: regisztralt, en: m.email === en };
      if (sajat) {
        o.email = m.email;
        const mh = fuggo.filter(function (x) { return normEmail(x.email) === m.email && String(x['téma']) === t.id; })
          .map(function (x) { return Number(x['lejár-ms']); });
        o.meghivoLejar = mh.length ? Math.max.apply(null, mh) : 0;
      }
      return o;
    });
    return {
      id: t.id, cim: t.cim, leiras: t.leiras, kepzes: t.kepzes, aktiv: t.aktiv, letrehozva: t.letrehozva,
      sajat: sajat, tag: tagLista.some(function (x) { return x.en; }),
      temavezeto: { nev: tv ? String(tv['név'] || '') : t.tv, email: t.tv },
      tagok: tagLista
    };
  });

  const rekordok = tabla(L.REC).sorok.filter(function (r) {
    return !r['Törölve'] && ids.indexOf(String(r['téma'])) >= 0;
  }).map(function (r) {
    const o = {};
    Object.keys(r).forEach(function (k) { if (k !== '_sor' && k !== 'Törölve') o[k] = r[k]; });
    return o;
  });

  return { user: userKi(u), topics: temaLista, records: rekordok, ido: most() };
}

/* ===================== Feldolgozások ===================== */

function rekordMent(u, b) {
  const rec = b.record || {};
  if (!rec.id || !rec.tema) throw hiba('BADREQ', 'Hiányzó azonosító vagy téma.');
  const a = hozzaferes(u, rec.tema);
  if (!a.tag) throw hiba('FORBIDDEN', 'Feldolgozást csak a téma hallgatói írhatnak. Témavezetőként a megjegyzés mezőben értékelhetsz.');
  if (!a.tema.aktiv) throw hiba('CLOSED', 'A téma le van zárva, új mentés nem lehetséges. Szólj a témavezetődnek.');
  const id = String(rec.id).slice(0, 80);
  const regi = tabla(L.REC).sorok.filter(function (r) { return String(r.id) === id; })[0] || null;
  if (regi && String(regi['téma']) !== String(a.tema.id)) throw hiba('FORBIDDEN', 'Ez a feldolgozás egy másik témához tartozik.');
  if (regi && regi['Törölve']) throw hiba('DELETED', 'Ezt a feldolgozást időközben törölték.');

  const ert = {};
  const mezok = rec.fields || {};
  Object.keys(mezok).slice(0, 80).forEach(function (k) {
    const kulcs = String(k).trim();
    if (!kulcs || kulcs.length > 60 || /^[=+\-@]/.test(kulcs) || REC_META.indexOf(kulcs) >= 0) return;
    ert[kulcs] = mezok[k];
  });
  const ido = most();
  ert['Módosítva'] = ido;
  ert['Utoljára módosította'] = String(u['név'] || u.email);
  if (!regi) {
    ert['id'] = id;
    ert['téma'] = a.tema.id;
    ert['Feldolgozó'] = String(u['név'] || '');
    ert['Feldolgozó e-mail'] = normEmail(u.email);
    ert['Létrehozva'] = ido;
    ert['Állapot'] = rec.bekuld ? 'beadva' : 'piszkozat';
  } else if (rec.bekuld) {
    ert['Állapot'] = 'beadva';
  }
  sorIr(L.REC, ert, regi ? regi._sor : 0);
  const kesz = tabla(L.REC).sorok.filter(function (r) { return String(r.id) === id; })[0];
  return { id: id, modositva: ido, allapot: kesz ? kesz['Állapot'] : ert['Állapot'] };
}

function rekordTorol(u, b) {
  const r = rekordKeres(b.id);
  const a = hozzaferes(u, r['téma']);
  if (!a.tv && !(a.tag && a.tema.aktiv)) throw hiba('FORBIDDEN', 'Ezt a feldolgozást nem törölheted.');
  sorIr(L.REC, { 'Törölve': most(), 'Utoljára módosította': String(u['név'] || u.email) }, r._sor);
  return { id: String(r.id) };
}

function ertekeles(u, b) {
  const r = rekordKeres(b.id);
  const a = hozzaferes(u, r['téma']);
  if (!a.tv) throw hiba('FORBIDDEN', 'Értékelni csak a téma témavezetője tud.');
  const allapot = String(b.allapot || '');
  if (ALLAPOTOK.indexOf(allapot) < 0) throw hiba('BADREQ', 'Ismeretlen állapot.');
  const ido = most();
  sorIr(L.REC, {
    'Állapot': allapot,
    'Témavezetői megjegyzés': String(b.megjegyzes == null ? '' : b.megjegyzes).slice(0, 20000),
    'Megjegyzés ideje': ido
  }, r._sor);
  return { id: String(r.id), allapot: allapot, ido: ido };
}

function rekordKeres(id) {
  const r = tabla(L.REC).sorok.filter(function (x) { return String(x.id) === String(id || ''); })[0];
  if (!r || r['Törölve']) throw hiba('NOTFOUND', 'A feldolgozás nem található.');
  return r;
}

/* ===================== Témák és tagok ===================== */

function temaMent(u, b) {
  if (!tvE(u)) throw hiba('FORBIDDEN', 'Témát csak témavezető hozhat létre.');
  const be = b.tema || {};
  const cim = String(be.cim || '').trim().slice(0, 300);
  if (!cim) throw hiba('BADREQ', 'Add meg a téma címét.');
  const ert = {
    'cím': cim,
    'leírás': String(be.leiras || '').trim().slice(0, 5000),
    'képzés': KEPZESEK.indexOf(be.kepzes) >= 0 ? be.kepzes : 'egyéb'
  };
  if (be.id) {
    const t = temaKeres(be.id);
    if (!t || t.tv !== normEmail(u.email)) throw hiba('FORBIDDEN', 'Ezt a témát nem szerkesztheted.');
    if (be.aktiv !== undefined) ert['aktív'] = be.aktiv ? 'igen' : 'nem';
    sorIr(L.TOPIC, ert, t.sor);
    return { tema: { id: t.id }, meghivok: [] };
  }
  const emailek = emailLista(b.hallgatok); // előbb ellenőrzünk, hogy hibás címnél ne jöjjön létre félkész téma
  let id;
  do { id = 'T-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase(); } while (temaKeres(id));
  ert['id'] = id;
  ert['témavezető'] = normEmail(u.email);
  ert['aktív'] = 'igen';
  ert['létrehozva'] = most();
  sorIr(L.TOPIC, ert);
  const meghivok = emailek.map(function (e) { return tagHozzaad(u, id, e); });
  return { tema: { id: id }, meghivok: meghivok };
}

function tagHozzaadAkcio(u, b) {
  const a = hozzaferes(u, b.tema);
  if (!a.tv) throw hiba('FORBIDDEN', 'Hallgatót csak a téma témavezetője vehet fel.');
  const emailek = emailLista(b.email);
  if (!emailek.length) throw hiba('EMAIL', 'Érvénytelen e-mail cím.');
  return { meghivok: emailek.map(function (e) { return tagHozzaad(u, a.tema.id, e); }) };
}

function tagHozzaad(u, temaId, email) {
  if (tagE(temaId, email)) return { email: email, mar: true, regisztralt: !!fiokVan(email) };
  sorIr(L.MEMBER, { 'téma': temaId, 'email': email, 'hozzáadva': most(), 'hozzáadta': normEmail(u.email) });
  if (fiokVan(email)) return { email: email, regisztralt: true };
  const m = meghivoKeszit(email, temaId, TIPUS_MEGHIVO, normEmail(u.email), MEGHIVO_NAP);
  return { email: email, regisztralt: false, token: m.token, lejar: m.lejar };
}

function tagTorol(u, b) {
  const a = hozzaferes(u, b.tema);
  if (!a.tv) throw hiba('FORBIDDEN', 'Hallgatót csak a téma témavezetője távolíthat el.');
  const email = normEmail(b.email);
  const m = tabla(L.MEMBER).sorok.filter(function (x) { return String(x['téma']) === a.tema.id && normEmail(x.email) === email; })[0];
  if (!m) throw hiba('NOTFOUND', 'Ez a hallgató nem tagja a témának.');
  tabla(L.MEMBER).sh.deleteRow(m._sor);
  delete MEMO[L.MEMBER];
  meghivokVisszavon(email, a.tema.id);
  return { email: email };
}

/** Új meghívó link (még nem regisztrált hallgatónak) vagy jelszó-visszaállító link (már regisztrált hallgatónak). */
function ujMeghivo(u, b) {
  const a = hozzaferes(u, b.tema);
  if (!a.tv) throw hiba('FORBIDDEN', 'Linket csak a téma témavezetője készíthet.');
  const email = normEmail(b.email);
  if (!tagE(a.tema.id, email)) throw hiba('NOTFOUND', 'Ez a hallgató nem tagja a témának.');
  const f = felhasznalo(email);
  let tipus = TIPUS_MEGHIVO, nap = MEGHIVO_NAP;
  if (f && f['jelszó-hash']) {
    // Jelszót a témavezető csak olyan hallgatónak állíthat vissza, aki kizárólag az ő témáiban szerepel.
    const en = normEmail(u.email);
    const idegen = tvE(f) || tagok().some(function (m) {
      if (m.email !== email) return false;
      const t = temaKeres(m.tema);
      return t && t.tv !== en;
    });
    if (idegen) throw hiba('RESETDENIED', 'Ennek a felhasználónak a jelszavát csak az adminisztrátor állíthatja vissza.');
    tipus = TIPUS_JELSZO; nap = VISSZAALLITO_NAP;
  }
  meghivokVisszavon(email, a.tema.id);
  const m = meghivoKeszit(email, a.tema.id, tipus, normEmail(u.email), nap);
  return { meghivo: { email: email, token: m.token, lejar: m.lejar, tipus: tipus === TIPUS_JELSZO ? 'reset' : 'invite' } };
}

/* ===================== Fiók ===================== */

function jelszoCsere(u, b) {
  if (!jelszoEllenoriz(String(b.regi || ''), u['jelszó-hash'])) throw hiba('WRONGPW', 'A jelenlegi jelszó nem egyezik.');
  const uj = String(b.uj || '');
  if (uj.length < MIN_JELSZO) throw hiba('PASSWORD', 'A jelszó legalább ' + MIN_JELSZO + ' karakter legyen.');
  sorIr(L.USER, { 'jelszó-hash': hashJelszo(uj) }, u._sor);
  return belepesValasz(felhasznalo(u.email));
}

function profilMent(u, b) {
  const nev = tisztaNev(b.nev);
  if (!nev) throw hiba('NAME', 'Add meg a neved.');
  sorIr(L.USER, { 'név': nev }, u._sor);
  return { user: userKi(felhasznalo(u.email)) };
}

/* ===================== Jogosultság ===================== */

function tvE(u) {
  return /^(témavezető|temavezeto|tv|supervisor|admin)$/i.test(String(u && u['szerep'] || '').trim());
}

/** Hozzáférés egy témához: tv = a téma témavezetője, tag = a téma hallgatója. */
function hozzaferes(u, temaId) {
  const t = temaKeres(temaId);
  if (!t) throw hiba('NOTFOUND', 'A téma nem található.');
  const en = normEmail(u.email);
  const a = { tema: t, tv: t.tv === en, tag: tagE(t.id, en) };
  if (!a.tv && !a.tag) throw hiba('FORBIDDEN', 'Ehhez a témához nincs hozzáférésed.');
  return a;
}

/* ===================== Meghívók ===================== */

function meghivoKeszit(email, temaId, tipus, letrehozta, nap) {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const lejar = Date.now() + nap * 24 * 3600 * 1000;
  sorIr(L.INVITE, {
    'token-hash': sha(token), 'email': normEmail(email), 'téma': temaId || '', 'típus': tipus,
    'lejár': Utilities.formatDate(new Date(lejar), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
    'lejár-ms': String(lejar), 'felhasználva': '', 'létrehozta': letrehozta, 'létrehozva': most()
  });
  return { token: token, lejar: lejar };
}

function meghivoKeres(token) {
  const t = String(token || '').trim();
  if (!/^[a-f0-9]{40,80}$/i.test(t)) throw hiba('INVITE', 'A link érvénytelen.');
  const h = sha(t);
  const m = tabla(L.INVITE).sorok.filter(function (x) { return String(x['token-hash']) === h; })[0];
  if (!m) throw hiba('INVITE', 'A link érvénytelen.');
  if (m['felhasználva']) throw hiba('INVITEUSED', 'Ezt a linket már felhasználták vagy visszavonták. Ha már regisztráltál, lépj be.');
  if (!(Number(m['lejár-ms']) > Date.now())) throw hiba('INVITEEXP', 'A link lejárt. Kérj újat a témavezetődtől.');
  return { sor: m._sor, email: normEmail(m.email), tema: String(m['téma'] || ''), tipus: String(m['típus']), letrehozta: String(m['létrehozta'] || '') };
}

/** A még fel nem használt linkek visszavonása (témára szűkítve, vagy null esetén mindet). */
function meghivokVisszavon(email, temaId) {
  email = normEmail(email);
  tabla(L.INVITE).sorok.filter(function (m) {
    return normEmail(m.email) === email && !m['felhasználva'] && (temaId === null || String(m['téma']) === String(temaId));
  }).forEach(function (m) { sorIr(L.INVITE, { 'felhasználva': 'visszavonva ' + most() }, m._sor); });
}

/* ===================== Jelszó-hash ===================== */

function hex(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function sha(s) {
  return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8));
}

function hashJelszo(jelszo, so, kor) {
  so = so || Utilities.getUuid().replace(/-/g, '');
  kor = kor || HASH_KOR;
  let h = String(jelszo);
  for (let i = 0; i < kor; i++) h = sha(so + ':' + h);
  return 'v1$' + kor + '$' + so + '$' + h;
}

function jelszoEllenoriz(jelszo, tarolt) {
  const r = String(tarolt || '').split('$');
  if (r.length !== 4 || r[0] !== 'v1' || !(Number(r[1]) > 0)) return false;
  return egyenlo(hashJelszo(jelszo, r[2], Number(r[1])), String(tarolt));
}

function egyenlo(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ===================== Segédfüggvények ===================== */

function normEmail(s) { return String(s || '').trim().toLowerCase(); }
function emailJo(e) { return e.length <= 120 && /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/.test(e); }
function tisztaNev(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120); }
function igaz(v) { return !(v === false || /^(nem|false|0|hamis|no)$/i.test(String(v == null ? '' : v).trim())); }

function emailLista(be) {
  const lista = Array.isArray(be) ? be : String(be || '').split(/[\s,;]+/);
  const ki = [];
  lista.map(normEmail).filter(Boolean).forEach(function (e) {
    if (!emailJo(e)) throw hiba('EMAIL', 'Érvénytelen e-mail cím: ' + e);
    if (ki.indexOf(e) < 0) ki.push(e);
  });
  if (ki.length > MAX_HALLGATO) throw hiba('BADREQ', 'Egyszerre legfeljebb ' + MAX_HALLGATO + ' hallgató vehető fel.');
  return ki;
}

function felhasznalo(email) {
  email = normEmail(email);
  if (!email) return null;
  return tabla(L.USER).sorok.filter(function (u) { return normEmail(u.email) === email; })[0] || null;
}

function fiokVan(email) {
  const f = felhasznalo(email);
  return !!(f && f['jelszó-hash']);
}

function temak() {
  return tabla(L.TOPIC).sorok.map(function (t) {
    return {
      sor: t._sor, id: String(t.id), cim: String(t['cím'] || ''), leiras: String(t['leírás'] || ''),
      kepzes: String(t['képzés'] || ''), tv: normEmail(t['témavezető']), aktiv: igaz(t['aktív']),
      letrehozva: String(t['létrehozva'] || '')
    };
  }).filter(function (t) { return t.id; });
}

function temaKeres(id) {
  id = String(id || '').trim();
  if (!id) return null;
  return temak().filter(function (t) { return t.id === id; })[0] || null;
}

function tagok() {
  return tabla(L.MEMBER).sorok.map(function (m) {
    return { sor: m._sor, tema: String(m['téma'] || ''), email: normEmail(m.email) };
  }).filter(function (m) { return m.tema && m.email; });
}

function tagE(temaId, email) {
  email = normEmail(email);
  return tagok().some(function (m) { return m.tema === String(temaId) && m.email === email; });
}

function most() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

/* ===================== Táblázatkezelés ===================== */

function lapFej(nev) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(nev) || ss.insertSheet(nev);
  fejlecBiztosit(sh, FEJ[nev]);
  return sh;
}

function fejlec(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(String) : [];
}

function fejlecBiztosit(sh, kulcsok) {
  const fej = fejlec(sh);
  const hianyzo = kulcsok.filter(function (k) { return fej.indexOf(k) < 0; });
  if (hianyzo.length) {
    sh.getRange(1, fej.length + 1, 1, hianyzo.length).setValues([hianyzo]);
    sh.getRange(1, 1, 1, fej.length + hianyzo.length).setFontWeight('bold').setBackground('#e8efe9');
    sh.setFrozenRows(1);
  }
  return fej.concat(hianyzo);
}

/** Egy lap beolvasása objektumok listájaként (a kérésen belül gyorsítótárazva). */
function tabla(nev) {
  if (MEMO[nev]) return MEMO[nev];
  const sh = lapFej(nev);
  const v = sh.getDataRange().getValues();
  const fej = (v[0] || []).map(String);
  const tz = Session.getScriptTimeZone();
  const sorok = [];
  for (let i = 1; i < v.length; i++) {
    const s = v[i];
    if (!s.some(function (c) { return c !== '' && c !== null; })) continue;
    const o = { _sor: i + 1 };
    fej.forEach(function (h, j) {
      if (!h) return;
      const x = s[j];
      o[h] = x instanceof Date ? Utilities.formatDate(x, tz, 'yyyy-MM-dd HH:mm') : x;
    });
    sorok.push(o);
  }
  MEMO[nev] = { sh: sh, fej: fej, sorok: sorok };
  return MEMO[nev];
}

function cella(v) {
  if (v === null || v === undefined) return '';
  let s = Array.isArray(v) ? v.join(', ') : String(v);
  if (s.charAt(0) === '=') s = "'" + s; // ne fusson le képletként
  return s.slice(0, 49000);
}

/** Sor írása: sor = 0 esetén új sor a végére, különben csak a megadott oszlopok frissülnek. */
function sorIr(nev, ert, sor) {
  const t = tabla(nev);
  const fej = fejlecBiztosit(t.sh, t.fej.concat(Object.keys(ert)));
  const regi = sor ? t.sh.getRange(sor, 1, 1, fej.length).getValues()[0] : null;
  const ujSor = fej.map(function (h, i) {
    if (Object.prototype.hasOwnProperty.call(ert, h)) return cella(ert[h]);
    return regi ? regi[i] : '';
  });
  const tart = t.sh.getRange(sor || t.sh.getLastRow() + 1, 1, 1, fej.length);
  tart.setNumberFormat('@');
  tart.setValues([ujSor]);
  delete MEMO[nev];
}
