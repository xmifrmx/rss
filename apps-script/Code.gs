/**
 * Hamdi Oto RSS → Blogger  |  Google Apps Script arka ucu (Supabase yok)
 *
 * Kurulum: README.md. Özet:
 *  1) Bu dosyayı + appsscript.json'u script.google.com'a yapıştır
 *  2) `kurulum` fonksiyonunu bir kez çalıştır (izinleri onayla)
 *  3) Dağıt > Web uygulaması: "Şu kullanıcı olarak çalıştır: Ben", "Erişim: Herkes"
 *  4) Web uygulaması URL'sini panele (GitHub Pages) gir
 */
const FEED_COLS = ['id', 'name', 'type', 'url', 'etiket', 'itemsPerRun', 'intervalMinutes', 'aktif', 'lastChecked', 'lastStatus', 'toplam', 'createdAt'];
const SHEETS = { Feeds: FEED_COLS, Sent: ['feedId', 'key', 'ts'], Logs: ['ts', 'feedId', 'feedName', 'status', 'message'] };
const BLOG_URL = 'https://mifrm.blogspot.com';
const DEFAULTS = { blogId: '2141149813172676021', tetikleyiciDk: 15, postBeklemeSn: 8, maxYasGun: 7, kaynakEkle: true };
const RUN_BUDGET_MS = 300000; // Apps Script 6 dk sınırının altında kal
const HDR = { 'User-Agent': 'Mozilla/5.0 (compatible; HamdiOtoRSSBot/2.0)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' };

// ---------- Kimlik doğrulama ----------
// E-posta ve şifre KODDA YOKTUR: Proje ayarları > Komut dosyası özellikleri'nde
// ADMIN_EMAIL ve ADMIN_PASSWORD adıyla tutulur (yalnızca proje sahibi görebilir).
function sha_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.newBlob(String(s)).getBytes())
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function safeEq_(a, b) { // sabit süreli karşılaştırma
  const x = sha_(a), y = sha_(b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}
function login_(r) {
  const c = CacheService.getScriptCache(), P = PropertiesService.getScriptProperties();
  const mail = (P.getProperty('ADMIN_EMAIL') || '').trim().toLowerCase(), pass = P.getProperty('ADMIN_PASSWORD') || '';
  if (!mail || !pass) return { ok: false, error: 'Yönetici bilgileri tanımlı değil. Apps Script > Proje ayarları > Komut dosyası özellikleri bölümüne ADMIN_EMAIL ve ADMIN_PASSWORD ekleyin.' };
  const fails = Number(c.get('fails') || 0);
  if (fails >= 5) return { ok: false, error: 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.' };
  const okMail = safeEq_(String(r.email || '').trim().toLowerCase(), mail);
  const okPass = safeEq_(String(r.password || '').trim(), pass.trim());
  if (!(okMail && okPass)) { c.put('fails', String(fails + 1), 900); return { ok: false, error: 'E-posta veya şifre hatalı.' }; }
  c.remove('fails');
  const t = Utilities.getUuid() + Utilities.getUuid();
  c.put('s_' + t, '1', 21600);
  return { ok: true, data: { token: t } };
}
function checkToken_(t) { return !!t && !!CacheService.getScriptCache().get('s_' + t); }

// ---------- Web uygulaması ----------
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ ok: true, service: 'hamdi-oto-rss' }); }
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, error: 'Geçersiz istek.' }); }
  try {
    if (req.action === 'login') return json_(login_(req));
    if (!checkToken_(req.token)) return json_({ ok: false, auth: false, error: 'Oturum süresi doldu.' });
    const fn = API_[req.action];
    if (!fn) return json_({ ok: false, error: 'Bilinmeyen işlem.' });
    return json_({ ok: true, data: fn(req) });
  } catch (err) { return json_({ ok: false, error: String((err && err.message) || err) }); }
}

// ---------- Veri (Google Sheets) ----------
let DB_ = null;
function db_() {
  if (DB_) return DB_;
  const p = PropertiesService.getScriptProperties();
  let ss = null;
  const id = p.getProperty('SHEET_ID');
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create('Hamdi Oto RSS Veritabanı'); p.setProperty('SHEET_ID', ss.getId()); }
  Object.keys(SHEETS).forEach(function (n) {
    let s = ss.getSheetByName(n);
    if (!s) { s = ss.insertSheet(n); s.getRange('A:L').setNumberFormat('@'); s.appendRow(SHEETS[n]); s.setFrozenRows(1); }
  });
  const d = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sayfa1');
  if (d && ss.getSheets().length > 1) ss.deleteSheet(d);
  DB_ = ss;
  return ss;
}
function locked_(fn) { const l = LockService.getScriptLock(); l.waitLock(20000); try { return fn(); } finally { l.releaseLock(); } }
function feeds_() {
  const s = db_().getSheetByName('Feeds'), n = s.getLastRow();
  if (n < 2) return [];
  return s.getRange(2, 1, n - 1, FEED_COLS.length).getValues().map(function (r) {
    const o = {};
    FEED_COLS.forEach(function (c, j) { o[c] = r[j]; });
    o.id = String(o.id);
    o.aktif = o.aktif === true || String(o.aktif).toLowerCase() === 'true';
    ['itemsPerRun', 'intervalMinutes', 'lastChecked', 'toplam', 'createdAt'].forEach(function (k) { o[k] = Number(o[k]) || 0; });
    return o;
  });
}
function rowOf_(id) {
  const s = db_().getSheetByName('Feeds'), n = s.getLastRow();
  if (n < 2) return 0;
  const ids = s.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}
function updateFields_(id, o) {
  const row = rowOf_(id);
  if (!row) return false;
  const s = db_().getSheetByName('Feeds');
  Object.keys(o).forEach(function (k) { const c = FEED_COLS.indexOf(k); if (c >= 0) s.getRange(row, c + 1).setValue(o[k]); });
  return true;
}
function settings_() {
  let o = {};
  try { o = JSON.parse(PropertiesService.getScriptProperties().getProperty('SETTINGS') || '{}'); } catch (e) { o = {}; }
  const r = Object.assign({}, DEFAULTS, o);
  if (!r.blogId) r.blogId = DEFAULTS.blogId;
  return r;
}
function log_(f, status, msg) {
  try { db_().getSheetByName('Logs').appendRow([Date.now(), f ? f.id : '', f ? f.name : '', status, String(msg).slice(0, 500)]); } catch (e) { console.error(e); }
}
function clamp_(v, a, b, d) { const n = parseInt(v, 10); return isNaN(n) ? d : Math.min(b, Math.max(a, n)); }

// ---------- Panel API ----------
const API_ = {
  status: function () {
    const P = PropertiesService.getScriptProperties(), fs = feeds_(), run = Number(P.getProperty('RUNNING') || 0);
    return {
      total: Number(P.getProperty('TOTAL') || 0), feeds: fs.length, active: fs.filter(function (f) { return f.aktif; }).length,
      running: !!run && Date.now() - run < 420000, lastRun: Number(P.getProperty('LAST_RUN') || 0),
      trigger: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'botCalistir'; }),
      quotaUntil: Number(P.getProperty('QUOTA_UNTIL') || 0), settings: settings_()
    };
  },
  feeds: function () { return feeds_(); },
  feedSave: function (r) {
    const url = String(r.url || '').trim(), etiket = String(r.etiket || '').trim();
    if (!/^https?:\/\/\S+$/i.test(url)) throw new Error('Geçerli bir http(s) adresi girin.');
    if (!etiket) throw new Error('Etiket / kategori zorunludur.');
    const v = {
      name: String(r.name || '').trim().slice(0, 100) || etiket,
      type: ['auto', 'rss', 'atom', 'youtube', 'dailymotion', 'vimeo'].indexOf(r.type) >= 0 ? r.type : 'auto',
      url: url, etiket: etiket.slice(0, 200), itemsPerRun: clamp_(r.itemsPerRun, 1, 20, 5), intervalMinutes: clamp_(r.intervalMinutes, 5, 1440, 60)
    };
    return locked_(function () {
      if (r.id) { if (!updateFields_(String(r.id), v)) throw new Error('Kaynak bulunamadı.'); return { id: r.id }; }
      const id = 'f' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      const f = Object.assign({ id: id, aktif: true, lastChecked: 0, lastStatus: '', toplam: 0, createdAt: Date.now() }, v);
      db_().getSheetByName('Feeds').appendRow(FEED_COLS.map(function (c) { return f[c]; }));
      return { id: id };
    });
  },
  feedToggle: function (r) { return locked_(function () { return updateFields_(String(r.id), { aktif: !!r.aktif }); }); },
  feedDelete: function (r) {
    return locked_(function () { const row = rowOf_(String(r.id)); if (row) db_().getSheetByName('Feeds').deleteRow(row); return !!row; });
  },
  feedTest: function (r) {
    const url = String(r.url || '').trim();
    if (!/^https?:\/\/\S+$/i.test(url)) throw new Error('Geçerli bir http(s) adresi girin.');
    const items = fetchFeed_(url);
    return { count: items.length, titles: items.slice(0, 5).map(function (i) { return i.title; }) };
  },
  settingsSave: function (r) {
    const s = {
      blogId: String(r.blogId || '').trim(), tetikleyiciDk: [5, 10, 15, 30, 60, 120, 240, 360, 480, 720].indexOf(Number(r.tetikleyiciDk)) >= 0 ? Number(r.tetikleyiciDk) : 15,
      postBeklemeSn: clamp_(r.postBeklemeSn, 2, 30, 8), maxYasGun: clamp_(r.maxYasGun, 0, 365, 7), kaynakEkle: !!r.kaynakEkle
    };
    if (s.blogId && !/^\d{5,25}$/.test(s.blogId)) throw new Error('Blog ID yalnızca rakamlardan oluşur (Blogger adres çubuğundaki blogID).');
    PropertiesService.getScriptProperties().setProperty('SETTINGS', JSON.stringify(s));
    installTrigger_(s.tetikleyiciDk);
    return s;
  },
  logs: function () {
    const s = db_().getSheetByName('Logs'), n = s.getLastRow();
    if (n < 2) return [];
    const from = Math.max(2, n - 99);
    return s.getRange(from, 1, n - from + 1, 5).getValues().reverse().map(function (r) { return { ts: Number(r[0]) || 0, feed: String(r[2]), status: String(r[3]), message: String(r[4]) }; });
  },
  runNow: function () {
    PropertiesService.getScriptProperties().setProperty('FORCE', '1');
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'botCalistirTek') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('botCalistirTek').timeBased().after(2000).create();
    return true;
  },
  blogTest: function () {
    const id = settings_().blogId;
    if (!id) throw new Error('Önce Ayarlar sekmesinden Blog ID girin.');
    const r = UrlFetchApp.fetch('https://www.googleapis.com/blogger/v3/blogs/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    const j = JSON.parse(r.getContentText() || '{}');
    if (r.getResponseCode() !== 200) throw new Error(blogErr_(r.getResponseCode(), j));
    const host = function (u) { return String(u || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase(); };
    if (host(j.url) !== host(BLOG_URL)) throw new Error('Bu Blog ID başka bir bloga ait: ' + j.url + ' (beklenen: ' + BLOG_URL + ')');
    return { name: j.name, url: j.url, posts: j.posts && j.posts.totalItems };
  }
};
function blogErr_(code, j) {
  const m = (j && j.error && j.error.message) || ('HTTP ' + code);
  if (/has not been used|is disabled|accessNotConfigured/i.test(m)) return m + ' → Apps Script projesini standart bir Cloud projesine bağlayıp Blogger API v3\'ü etkinleştirin (README, Adım 5).';
  return m;
}

// ---------- Tetikleyici ----------
function installTrigger_(dk) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'botCalistir') ScriptApp.deleteTrigger(t); });
  const b = ScriptApp.newTrigger('botCalistir').timeBased();
  if (dk < 60) b.everyMinutes(dk); else b.everyHours(dk / 60);
  b.create();
}
function kurulum() { // editörden bir kez çalıştırın
  db_();
  installTrigger_(settings_().tetikleyiciDk);
  console.log('Kurulum tamam. Sıradaki adım: Dağıt > Yeni dağıtım > Web uygulaması.');
}
function botCalistirTek() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'botCalistirTek') ScriptApp.deleteTrigger(t); });
  botCalistir();
}

// ---------- Bot ----------
function acquire_() {
  return locked_(function () {
    const P = PropertiesService.getScriptProperties(), r = Number(P.getProperty('RUNNING') || 0);
    if (r && Date.now() - r < 420000) return false;
    P.setProperty('RUNNING', String(Date.now()));
    return true;
  });
}
function botCalistir() {
  if (!acquire_()) return;
  const P = PropertiesService.getScriptProperties();
  try { run_(); } catch (e) { log_(null, 'hata', 'Genel hata: ' + e.message); }
  finally { P.deleteProperty('RUNNING'); P.setProperty('LAST_RUN', String(Date.now())); }
}
function run_() {
  const P = PropertiesService.getScriptProperties(), S = settings_(), t0 = Date.now(), end = t0 + RUN_BUDGET_MS;
  const force = P.getProperty('FORCE') === '1';
  P.deleteProperty('FORCE');
  if (!S.blogId) { const c = CacheService.getScriptCache(); if (!c.get('noblog')) { c.put('noblog', '1', 3600); log_(null, 'hata', 'Blog ID ayarlanmamış (Ayarlar sekmesi).'); } return; }
  if (!force && Date.now() < Number(P.getProperty('QUOTA_UNTIL') || 0)) return;
  const due = feeds_().filter(function (f) { return f.aktif && (force || !f.lastChecked || (t0 - f.lastChecked) / 60000 >= f.intervalMinutes - 1); });
  if (!due.length) return;
  const sent = loadSent_();
  const qs = [];
  for (let i = 0; i < due.length && Date.now() < end - 60000; i++) qs.push(prepare_(due[i], sent, S));
  let stop = false, progress = true;
  while (progress && !stop && Date.now() < end - 15000) {
    progress = false;
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      if (stop || Date.now() >= end - 15000) break;
      if (q.err || q.done >= q.limit || q.fail >= 3) continue;
      const it = q.queue.shift();
      if (!it) { q.exhausted = true; continue; }
      progress = true;
      const r = publish_(q.f, it, S, sent);
      if (r === 'ok') { q.done++; Utilities.sleep(S.postBeklemeSn * 1000); }
      else if (r === 'quota') { stop = true; P.setProperty('QUOTA_UNTIL', String(Date.now() + 3600000)); }
      else if (r === 'fatal') stop = true;
      else if (r === 'skip') continue;
      else q.fail++;
    }
  }
  qs.forEach(function (q) {
    if (q.err) return;
    if (q.done >= q.limit || q.fail >= 3 || !q.queue.length) updateFields_(q.f.id, { lastChecked: Date.now(), lastStatus: 'ok', toplam: q.f.toplam });
  });
  pruneSheets_();
}
function loadSent_() {
  const s = db_().getSheetByName('Sent'), n = s.getLastRow(), m = { '*': new Set() };
  if (n > 1) s.getRange(2, 1, n - 1, 2).getValues().forEach(function (r) { const k = String(r[1]); (m[r[0]] = m[r[0]] || new Set()).add(k); if (k[0] === 'l') m['*'].add(k); });
  return m;
}
function pruneSheets_() {
  const ss = db_(), sent = ss.getSheetByName('Sent'), logs = ss.getSheetByName('Logs');
  if (sent.getLastRow() > 30000) sent.deleteRows(2, 10000);
  if (logs.getLastRow() > 1500) logs.deleteRows(2, logs.getLastRow() - 1000);
}
function key_(s, p) {
  const h = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s));
  return p + h.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function lk_(u) {
  return String(u).trim().replace(/#.*$/, '').replace(/^http:\/\//i, 'https://').replace(/^(https:\/\/)www\./i, '$1')
    .replace(/([?&])(utm_[^=&]*|fbclid|gclid)=[^&]*/gi, '$1').replace(/&&+/g, '&').replace(/\?&/, '?').replace(/[?&]+$/, '').replace(/\/+(\?|$)/, '$1').toLowerCase();
}
function keysOf_(it) { return [key_(it.guid, 'g'), it.link ? key_(lk_(it.link), 'l') : '']; }
function isKnown_(sent, fid, ks) { return (sent[fid] && sent[fid].has(ks[0])) || (!!ks[1] && sent['*'].has(ks[1])); }
function prepare_(f, sent, S) {
  try {
    let items = fetchFeed_(f.url);
    const maxAge = S.maxYasGun * 86400000, now = Date.now(), seen = new Set();
    items = items.filter(function (i) {
      const ks = keysOf_(i);
      if (isKnown_(sent, f.id, ks) || seen.has(ks[0]) || (ks[1] && seen.has(ks[1]))) return false;
      seen.add(ks[0]); if (ks[1]) seen.add(ks[1]);
      return !(maxAge && i.date && now - i.date > maxAge);
    });
    if (items.length && items.every(function (i) { return i.date; })) items.sort(function (a, b) { return a.date - b.date; }); else items.reverse();
    return { f: f, queue: items, done: 0, fail: 0, limit: f.itemsPerRun || 3, err: false };
  } catch (e) {
    log_(f, 'hata', 'Feed okunamadı (' + f.url + '): ' + e.message);
    updateFields_(f.id, { lastChecked: Date.now(), lastStatus: 'hata: ' + String(e.message).slice(0, 120) });
    return { f: f, queue: [], done: 0, fail: 0, limit: 0, err: true };
  }
}
function publish_(f, it, S, sent) {
  if (isKnown_(sent, f.id, keysOf_(it))) return 'skip';
  let html;
  try { html = build_(f, it, S); } catch (e) { log_(f, 'hata', 'İçerik hazırlanamadı: ' + e.message + ' (' + it.title + ')'); return 'err'; }
  const r = bloggerPost_(S.blogId, { title: (it.title || '(Başlıksız)').slice(0, 250), content: html, labels: f.etiket.split(',').map(function (x) { return x.trim(); }).filter(Boolean) });
  if (!r.ok) {
    log_(f, 'hata', 'Blogger: ' + r.msg + ' (' + it.title + ')');
    if (r.code === 429 || /rateLimit|quotaExceeded|dailyLimit/i.test(r.reason)) return 'quota';
    if (r.code === 401 || r.code === 403 || r.code === 404) return 'fatal';
    return 'err';
  }
  const set = (sent[f.id] = sent[f.id] || new Set()), s = db_().getSheetByName('Sent'), keys = keysOf_(it).filter(Boolean);
  keys.forEach(function (k) {
    set.add(k); if (k[0] === 'l') sent['*'].add(k);
    for (let a = 0; a < 3; a++) { try { s.appendRow([f.id, k, Date.now()]); break; } catch (e) { Utilities.sleep(500); } }
  });
  f.toplam++;
  updateFields_(f.id, { toplam: f.toplam });
  const P = PropertiesService.getScriptProperties();
  P.setProperty('TOTAL', String(Number(P.getProperty('TOTAL') || 0) + 1));
  log_(f, 'ok', 'Yayınlandı: ' + it.title);
  return 'ok';
}
function bloggerPost_(blogId, body) {
  let res;
  try {
    res = UrlFetchApp.fetch('https://www.googleapis.com/blogger/v3/blogs/' + encodeURIComponent(blogId) + '/posts/', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: JSON.stringify(body), muteHttpExceptions: true
    });
  } catch (e) { return { ok: false, code: 0, reason: '', msg: e.message }; }
  const code = res.getResponseCode();
  if (code >= 200 && code < 300) return { ok: true };
  let j = {};
  try { j = JSON.parse(res.getContentText()); } catch (e) { j = {}; }
  const reason = (j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || (j.error && j.error.status) || '';
  return { ok: false, code: code, reason: String(reason), msg: blogErr_(code, j) };
}

// ---------- İçerik üretimi ----------
function build_(f, it, S) {
  let type = f.type;
  if (!type || type === 'auto') {
    const u = (f.url || '').toLowerCase();
    type = /youtube\.com|youtu\.be/.test(u) ? 'youtube' : /dailymotion\.com/.test(u) ? 'dailymotion' : /vimeo\.com/.test(u) ? 'vimeo' : 'rss';
  }
  let raw = String(it.html || '');
  if (raw && !/<[a-z][\s\S]*>/i.test(raw)) raw = esc_(raw).replace(/\r?\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  let html = format_(clean_(raw, it.link));
  if (it.thumb && !/<img/i.test(html) && type === 'rss') html = clean_('<img src="' + esc_(it.thumb) + '">', it.link) + html;
  html = embed_(type, it) + html;
  if (S.kaynakEkle && /^https?:\/\//i.test(it.link || '')) {
    const host = (/^https?:\/\/([^\/?#]+)/i.exec(it.link) || [0, it.link])[1];
    html += '<p>Kaynak: <a href="' + esc_(it.link) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc_(host) + '</a></p>';
  }
  return html;
}
function format_(h) {
  h = h.replace(/<p>(?:\s|&nbsp;|<br>)*<\/p>/gi, '');
  if (!/<(p|div|ul|ol|table|blockquote|pre|figure)[\s>]/i.test(h)) {
    h = h.split(/(<h[23]>[\s\S]*?<\/h[23]>)/i).map(function (part) {
      if (/^<h[23]>/i.test(part)) return part;
      return part.split(/(?:<br>\s*){2,}|\n{2,}/i).map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) { return '<p>' + x + '</p>'; }).join('');
    }).join('');
  }
  return h.replace(/<p>((?:(?!<\/p>)[\s\S]){0,250})<\/p>/gi, function (m, t) {
    return /appeared first on|first appeared on|ilk olarak .{0,80}(göründü|yayınlandı)/i.test(t.replace(/<[^>]+>/g, '')) ? '' : m;
  });
}
function embed_(type, it) {
  let src = '', m;
  const link = it.link || '';
  if (type === 'youtube') { const id = it.videoId || ((m = /(?:v=|youtu\.be\/)([\w-]{6,20})/.exec(link)) && m[1]); if (id && /^[\w-]{6,20}$/.test(id)) src = 'https://www.youtube.com/embed/' + id; }
  else if (type === 'dailymotion') { if ((m = /dailymotion\.com\/video\/([a-zA-Z0-9]+)/.exec(link))) src = 'https://www.dailymotion.com/embed/video/' + m[1]; }
  else if (type === 'vimeo') { if ((m = /vimeo\.com\/(?:[\w\/-]*\/)?(\d+)/.exec(link))) src = 'https://player.vimeo.com/video/' + m[1]; }
  if (!src) return '';
  return '<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;margin:12px 0;"><iframe src="' + src + '" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen loading="lazy"></iframe></div>';
}

// ---------- HTML temizleme (izin listesi tabanlı) ----------
const OK_TAGS = {
  a: ['href', 'title'], img: ['src', 'alt', 'title', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'],
  p: [], br: [], hr: [], b: [], strong: [], i: [], em: [], u: [], s: [], del: [], ins: [], blockquote: [], ul: [], ol: [], li: [], h2: [], h3: [],
  table: [], thead: [], tbody: [], tfoot: [], tr: [], pre: [], code: [], span: [], div: [], figure: [], figcaption: [], sup: [], sub: [], small: [], mark: [], cite: [], q: [], dl: [], dt: [], dd: []
};
const DROP_TAGS = ['script', 'style', 'iframe', 'noscript', 'object', 'embed', 'form', 'textarea', 'select', 'svg', 'math', 'template', 'head', 'title', 'button', 'audio', 'video', 'canvas', 'applet', 'frameset'];
function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function dec_(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);?/gi, function (m, h) { return String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)); })
    .replace(/&#(\d+);?/g, function (m, d) { return String.fromCodePoint(Math.min(+d, 0x10ffff)); })
    .replace(/&(quot|apos|lt|gt|nbsp|amp);/gi, function (m, n) { return { quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', amp: '&' }[n.toLowerCase()]; });
}
function url_(v, base, img) {
  v = String(v).trim().replace(/[\u0000-\u001f\u007f-\u009f\u200b]/g, '');
  let probe = v.replace(/\s/g, '');
  if (!probe) return '';
  if (/^\/\//.test(probe)) { v = 'https:' + v; probe = 'https:' + probe; }
  const sm = /^([a-z][a-z0-9+.\-]*):/i.exec(probe);
  if (sm) {
    const s = sm[1].toLowerCase();
    if (s === 'http' || s === 'https') return v.replace(/\s/g, '%20');
    if (!img && (s === 'mailto' || s === 'tel')) return probe;
    if (img && s === 'data' && /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+\/=]+$/i.test(probe)) return probe;
    return '';
  }
  if (probe[0] === '#') return img ? '' : probe;
  const o = /^(https?:\/\/[^\/?#]+)/i.exec(base || '');
  if (!o) return '';
  return (probe[0] === '/' ? o[1] + v : String(base).replace(/[?#].*$/, '').replace(/[^\/]*$/, '') + v).replace(/\s/g, '%20');
}
function clean_(html, base) {
  html = String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  const stack = [], txt = function (s) { return s.replace(/</g, '&lt;'); };
  const closer = function (n) { return n === 'table' ? '</table></div>' : '</' + n + '>'; };
  let out = '', last = 0, m;
  while ((m = re.exec(html))) {
    out += txt(html.slice(last, m.index));
    last = re.lastIndex;
    const close = m[1] === '/';
    let name = m[2].toLowerCase();
    if (DROP_TAGS.indexOf(name) >= 0) {
      if (!close) { const e = new RegExp('</' + name + '\\s*>', 'ig'); e.lastIndex = re.lastIndex; const x = e.exec(html); last = re.lastIndex = x ? e.lastIndex : html.length; }
      continue;
    }
    if (/^h[12]$/.test(name)) name = 'h2'; else if (/^h[3-6]$/.test(name)) name = 'h3';
    if (!OK_TAGS[name]) continue;
    if (close) {
      const i = stack.lastIndexOf(name);
      if (i >= 0) while (stack.length > i) out += closer(stack.pop());
      continue;
    }
    let attrs = '', a;
    const ar = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    while ((a = ar.exec(m[3]))) {
      const k = a[1].toLowerCase();
      if (OK_TAGS[name].indexOf(k) < 0) continue;
      let v = dec_(a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] || '');
      if (k === 'href' || k === 'src') { v = url_(v, base, name === 'img'); if (!v) continue; }
      else if (/^(width|height|colspan|rowspan)$/.test(k) && !/^\d{1,4}$/.test(v)) continue;
      attrs += ' ' + k + '="' + esc_(v) + '"';
    }
    if (name === 'img') { if (attrs.indexOf(' src=') >= 0) out += '<img' + attrs + ' style="max-width:100%;height:auto;display:block;margin:8px 0;" loading="lazy">'; continue; }
    if (name === 'a') attrs += ' target="_blank" rel="noopener noreferrer nofollow"';
    if (name === 'table') out += '<div style="overflow-x:auto;">';
    out += '<' + name + attrs + '>';
    if (name !== 'br' && name !== 'hr') stack.push(name);
  }
  out += txt(html.slice(last));
  while (stack.length) out += closer(stack.pop());
  return out;
}

// ---------- RSS / Atom okuma ----------
function fetchFeed_(url) {
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: HDR });
  if (r.getResponseCode() >= 400) throw new Error('HTTP ' + r.getResponseCode());
  let x = r.getContentText('UTF-8');
  const enc = /<\?xml[^>]*encoding=["']([^"']+)["']/i.exec(x.slice(0, 200));
  if (enc && !/utf-?8/i.test(enc[1])) { try { x = r.getContentText(enc[1]); } catch (e) { /* UTF-8 ile devam */ } }
  x = x.replace(/^\uFEFF/, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/(<!\[CDATA\[[\s\S]*?\]\]>)|&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, function (m, c) { return c || '&amp;'; });
  x = x.replace(/<!DOCTYPE[^>\[]*(\[[\s\S]*?\])?\s*>/i, '');
  if (!/<(rss|feed|rdf:RDF)\b/i.test(x)) throw new Error('RSS/Atom biçiminde değil');
  try { return parseXml_(x); } catch (e) { throw new Error('XML ayrıştırılamadı: ' + e.message); }
}
function kid_(el, n, ns) {
  const k = el.getChildren();
  for (let i = 0; i < k.length; i++) {
    const u = k[i].getNamespace().getURI();
    if (k[i].getName() === n && (ns ? u.indexOf(ns) >= 0 : !/mrss|modules\/content|youtube|purl\.org\/dc/.test(u))) return k[i];
  }
  return null;
}
function txt_(el, n, ns) { const k = el && kid_(el, n, ns); return k ? k.getText().trim() : ''; }
function attr_(el, a) { const v = el && el.getAttribute(a); return v ? v.getValue() : ''; }
function thumb_(n) {
  const g = kid_(n, 'group', 'mrss'), cs = g ? [n, g] : [n];
  for (let i = 0; i < cs.length; i++) { const t = kid_(cs[i], 'thumbnail', 'mrss'); if (t && attr_(t, 'url')) return attr_(t, 'url'); }
  for (let i = 0; i < cs.length; i++) { const c = kid_(cs[i], 'content', 'mrss'); if (c && attr_(c, 'url') && (/^image/.test(attr_(c, 'type')) || attr_(c, 'medium') === 'image')) return attr_(c, 'url'); }
  const e = kid_(n, 'enclosure');
  return e && /^image/.test(attr_(e, 'type')) ? attr_(e, 'url') : '';
}
function item_(title, link, guid, html, date, n) {
  title = dec_(String(title).replace(/<[^>]+>/g, '')).trim();
  if (!guid) guid = link || title;
  if (!guid) return null;
  const g = kid_(n, 'group', 'mrss');
  return { title: title, link: link, guid: guid, html: html || (g ? txt_(g, 'description', 'mrss') : '') || txt_(n, 'description', 'mrss'), date: date, thumb: thumb_(n), videoId: txt_(n, 'videoId', 'youtube') };
}
function parseXml_(x) {
  const root = XmlService.parse(x).getRootElement(), rn = root.getName();
  let nodes;
  if (rn === 'feed') nodes = root.getChildren().filter(function (c) { return c.getName() === 'entry'; });
  else { const ch = rn === 'rss' ? kid_(root, 'channel') : root; nodes = (ch || root).getChildren().filter(function (c) { return c.getName() === 'item'; }); }
  return nodes.map(function (n) {
    if (rn === 'feed') {
      let link = '';
      n.getChildren().forEach(function (k) { if (k.getName() === 'link' && !link && (!attr_(k, 'rel') || attr_(k, 'rel') === 'alternate')) link = attr_(k, 'href'); });
      let c = kid_(n, 'content') || kid_(n, 'summary'), html = '';
      if (c) html = attr_(c, 'type') === 'xhtml' ? c.getChildren().map(function (k) { return XmlService.getRawFormat().format(k); }).join('') : c.getText();
      return item_(txt_(n, 'title'), link, txt_(n, 'id'), html, Date.parse(txt_(n, 'published') || txt_(n, 'updated')) || 0, n);
    }
    const link = txt_(n, 'link');
    return item_(txt_(n, 'title'), link, txt_(n, 'guid'), txt_(n, 'encoded', 'modules/content') || txt_(n, 'description'), Date.parse(txt_(n, 'pubDate') || txt_(n, 'date', 'purl.org/dc')) || 0, n);
  }).filter(Boolean);
}
