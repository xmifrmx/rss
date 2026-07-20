/**
 * RSS -> Blogger otomasyonu
 * Supabase (kota yok) + GitHub Actions (zamanlayıcı) ile çalışır.
 *
 * Ortam değişkenleri (GitHub Secrets üzerinden gelir):
 *  SUPABASE_URL, SUPABASE_SERVICE_KEY
 *  BLOG_ID
 *  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 */

import { createClient } from "@supabase/supabase-js";
import Parser from "rss-parser";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  BLOG_ID,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  MAX_POSTS_PER_FEED = "3", // her çalıştırmada, feed başına en fazla kaç yeni yazı atılsın
} = process.env;

function requireEnv() {
  const required = {
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    BLOG_ID,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error("Eksik ortam değişkeni(leri): " + missing.join(", "));
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const parser = new Parser({
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["yt:videoId", "ytVideoId"],
    ],
  },
  timeout: 20000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; HamdiOtoRSSBot/1.0)" },
});

// ---------- Kategori belirleme ----------
// Panelde "Blogger Etiketi / Kategorisi" alanına elle yazdığınız değer HER ZAMAN
// esas alınır. Sadece bu alan boş bırakılırsa anahtar kelimeye göre otomatik
// bir kategori tahmin edilir (yedek mekanizma).
const KATEGORI_ANAHTAR_KELIME = {
  Otomobil: ["otomobil", "araç", "araba", "motor", "elektrikli araç", "suv", "sedan", "lastik", "sürüş"],
  Ekonomi: ["dolar", "euro", "borsa", "enflasyon", "faiz", "ekonomi", "piyasa", "tl ", "kur ", "zam"],
  Spor: ["futbol", "basketbol", "voleybol", "maç", "gol", "transfer", "lig", "şampiyon", "spor"],
  Teknoloji: ["yapay zeka", "teknoloji", "yazılım", "uygulama", "telefon", "işlemci", "google", "apple", "microsoft"],
  Haberler: ["haber", "gündem", "açıklama", "bakan", "meclis", "kriz"],
  "Rüya Tabirleri": ["rüya", "rüyada", "tabir"],
  "Tarihte Bugün": ["tarihte bugün", "yılında", "doğdu", "vefat etti"],
  Video: ["video", "izle", "fragman"],
};

function kategoriBelirle(baslik, ozet, manuelEtiket) {
  if (manuelEtiket && manuelEtiket.trim()) return manuelEtiket.trim();
  const metin = `${baslik || ""} ${ozet || ""}`.toLowerCase();
  for (const [kategori, kelimeler] of Object.entries(KATEGORI_ANAHTAR_KELIME)) {
    if (kelimeler.some((k) => metin.includes(k))) return kategori;
  }
  return "Genel";
}

// ---------- Kaynak türü tespiti ----------
function kaynakTuruTespitEt(sourceType, url) {
  if (sourceType && sourceType !== "auto") return sourceType;
  const u = (url || "").toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("dailymotion.com")) return "dailymotion";
  if (u.includes("vimeo.com")) return "vimeo";
  return "rss"; // rss-parser Atom feed'lerini de aynı şekilde okuyabilir
}

// ---------- Video gömme (embed) ----------
function responsiveEmbedSar(iframeHtml) {
  return (
    '<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;margin:12px 0;">' +
    iframeHtml.replace(
      "<iframe",
      '<iframe style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"'
    ) +
    "</div>"
  );
}

function videoEmbedOlustur(kaynakTuru, item) {
  const link = item.link || "";
  try {
    if (kaynakTuru === "youtube") {
      let videoId = item.ytVideoId;
      if (!videoId) {
        const m = link.match(/(?:v=|youtu\.be\/)([\w-]{6,})/);
        videoId = m ? m[1] : null;
      }
      if (!videoId) return null;
      return responsiveEmbedSar(
        `<iframe src="https://www.youtube.com/embed/${videoId}" allowfullscreen loading="lazy"></iframe>`
      );
    }
    if (kaynakTuru === "dailymotion") {
      const m = link.match(/dailymotion\.com\/video\/([\w]+)/);
      if (!m) return null;
      return responsiveEmbedSar(
        `<iframe src="https://www.dailymotion.com/embed/video/${m[1]}" allowfullscreen loading="lazy"></iframe>`
      );
    }
    if (kaynakTuru === "vimeo") {
      const m = link.match(/vimeo\.com\/(?:channels\/[\w-]+\/)?(\d+)/);
      if (!m) return null;
      return responsiveEmbedSar(
        `<iframe src="https://player.vimeo.com/video/${m[1]}" allowfullscreen loading="lazy"></iframe>`
      );
    }
  } catch {
    return null;
  }
  return null;
}

// ---------- Güvenli HTML temizleme ----------
function guvenlikTemizle(html) {
  if (!html) return "";
  let t = html;
  const zararli = ["script", "style", "iframe", "noscript", "object", "embed", "form"];
  for (const ad of zararli) {
    t = t.replace(new RegExp(`<${ad}[^>]*>[\\s\\S]*?<\\/${ad}\\s*>`, "gi"), "");
    t = t.replace(new RegExp(`<${ad}[^>]*\\/?>`, "gi"), "");
  }
  t = t.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  t = t.replace(/href\s*=\s*(["'])\s*javascript:[^"']*\1/gi, 'href="#"');
  return t;
}

function bloggerFormatla(ham) {
  if (!ham) return "<p>İçerik bulunamadı.</p>";
  let html = guvenlikTemizle(ham);
  html = html.replace(/<h[1-6](\s[^>]*)?>/gi, "<h2>");
  html = html.replace(/<\/h[1-6]>/gi, "</h2>");
  html = html.replace(
    /<img(?![^>]*style=)([^>]*)(\/?)>/gi,
    '<img style="max-width:100%;height:auto;display:block;margin:8px 0;"$1$2>'
  );
  // Mobil uyumluluk için: taşan tablo/pre gibi blokları saran wrapper
  html = html.replace(/<table/gi, '<div style="overflow-x:auto;"><table').replace(/<\/table>/gi, "</table></div>");
  return html;
}

function ozetCikar(html, uzunluk = 200) {
  const text = (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, uzunluk);
}

// ---------- Blogger OAuth ----------
let cachedAccessToken = null;
let cachedAccessTokenExpiry = 0;

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiry - 60000) {
    return cachedAccessToken;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error("OAuth token alınamadı: " + JSON.stringify(data));
  }
  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedAccessToken;
}

async function bloggerPostAt(baslik, icerikHtml, etiket) {
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: baslik,
      content: icerikHtml,
      labels: etiket ? [etiket] : [],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error("Blogger API hatası: " + JSON.stringify(data));
  }
  return data;
}

const BLOGGER_ISTEKLER_ARASI_MS = 2000; // Blogger API rate limit'ine takılmamak için her gönderim arası bekleme
function beklet(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Ana akış ----------
async function main() {
  requireEnv();

  const { data: feeds, error: feedErr } = await supabase
    .from("feeds")
    .select("*")
    .eq("aktif", true);

  if (feedErr) throw new Error("Feed listesi alınamadı: " + feedErr.message);
  if (!feeds || !feeds.length) {
    console.log("Aktif RSS kaynağı yok.");
    return;
  }

  const now = Date.now();
  const isleyecekler = feeds.filter((f) => {
    if (!f.last_checked) return true;
    const gecenDk = (now - new Date(f.last_checked).getTime()) / 60000;
    return gecenDk >= f.interval_minutes;
  });

  console.log(`${feeds.length} aktif kaynaktan ${isleyecekler.length} tanesi bu çalıştırmada işlenecek.`);
  if (!isleyecekler.length) return;

  // Her kaynağın gönderilecek-öğe kuyruğunu hazırla (feed'i oku, henüz gönderilmemiş öğeleri belirle)
  const kuyruklar = [];
  for (const feed of isleyecekler) {
    kuyruklar.push(await kuyrukHazirla(feed));
  }

  // Dönüşümlü (round-robin) gönderim: Blogger'ın kısıtlı kotası TEK bir kaynak
  // tarafından tüketilmesin diye, her turda sırayla her kaynaktan bir öğe gönderilir.
  let kotaBitti = false;
  let ilerlemeVar = true;
  while (ilerlemeVar && !kotaBitti) {
    ilerlemeVar = false;
    for (const k of kuyruklar) {
      if (kotaBitti) break;
      if (k.okumaHatasi || k.atilan >= k.limit) continue;
      const sonraki = sonrakiOgeyiAl(k);
      if (!sonraki) continue;
      ilerlemeVar = true;

      const sonuc = await ogeyiGonder(k.feed, sonraki.item, sonraki.guid, k.kaynakTuru);
      if (sonuc === "ok") {
        k.atilan++;
      } else if (sonuc === "rate_limit") {
        kotaBitti = true;
        console.warn(
          "[UYARI] Blogger kotası doldu, bu çalıştırma burada durduruluyor; kalan öğeler bir sonraki çalıştırmada denenecek."
        );
      }
      // 'hata' (rate limit dışı) durumda aynı kaynağın bir sonraki öğesine geçilir
    }
  }

  // Başarıyla okunan tüm kaynaklar için last_checked güncelle (okuma hatası alanlar hariç,
  // böylece bir sonraki çalıştırmada hemen tekrar denenirler)
  for (const k of kuyruklar) {
    if (!k.okumaHatasi) {
      await supabase.from("feeds").update({ last_checked: new Date().toISOString() }).eq("id", k.feed.id);
    }
  }
}

async function kuyrukHazirla(feed) {
  try {
    const rss = await parser.parseURL(feed.url);
    const items = rss.items || []; // feed'in sağladığı TÜM öğelere bak (kaynak zaten kendi geçmişiyle sınırlı)

    const { data: gonderilmisler } = await supabase
      .from("sent_posts")
      .select("guid")
      .eq("feed_id", feed.id);
    const gonderilmisSet = new Set((gonderilmisler || []).map((g) => g.guid));

    return {
      feed,
      items,
      gonderilmisSet,
      cursor: 0,
      atilan: 0,
      limit: parseInt(feed.items_per_run, 10) || parseInt(MAX_POSTS_PER_FEED, 10) || 3,
      kaynakTuru: kaynakTuruTespitEt(feed.source_type, feed.url),
      okumaHatasi: false,
    };
  } catch (err) {
    await supabase.from("run_logs").insert({
      feed_id: feed.id,
      status: "hata",
      message: `Feed okunamadı (${feed.url}): ${err.message}`,
    });
    console.error(`[HATA] Feed okunamadı: ${feed.url}`, err.message);
    return { feed, items: [], gonderilmisSet: new Set(), cursor: 0, atilan: 0, limit: 0, kaynakTuru: null, okumaHatasi: true };
  }
}

function sonrakiOgeyiAl(kuyruk) {
  while (kuyruk.cursor < kuyruk.items.length) {
    const item = kuyruk.items[kuyruk.cursor++];
    const guid = item.guid || item.id || item.link;
    if (guid && !kuyruk.gonderilmisSet.has(guid)) {
      return { item, guid };
    }
  }
  return null;
}

async function ogeyiGonder(feed, item, guid, kaynakTuru) {
  const hamIcerik = item.contentEncoded || item.content || item.contentSnippet || "";
  let html = bloggerFormatla(hamIcerik);
  const embed = videoEmbedOlustur(kaynakTuru, item);
  if (embed) html = embed + html; // video varsa en üste göm
  const ozet = ozetCikar(html);
  const kategori = kategoriBelirle(item.title, ozet, feed.etiket);

  try {
    await bloggerPostAt(item.title || "(Başlıksız)", html, kategori);
    await supabase.from("sent_posts").insert({ feed_id: feed.id, guid });
    await supabase.from("run_logs").insert({
      feed_id: feed.id,
      status: "ok",
      message: `Yayınlandı: ${item.title}`,
    });
    console.log(`[OK] ${feed.url} -> ${item.title}`);
    await beklet(BLOGGER_ISTEKLER_ARASI_MS); // Blogger rate limit'ine takılmamak için istekler arası bekleme
    return "ok";
  } catch (postErr) {
    await supabase.from("run_logs").insert({
      feed_id: feed.id,
      status: "hata",
      message: `Blogger gönderim hatası: ${postErr.message} (${item.title})`,
    });
    console.error(`[HATA] ${feed.url} -> ${item.title}:`, postErr.message);
    if (/"code":429/.test(postErr.message) || /RESOURCE_EXHAUSTED/i.test(postErr.message)) {
      return "rate_limit";
    }
    return "hata";
  }
}

main()
  .then(() => {
    console.log("Çalıştırma tamamlandı.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Genel hata:", err);
    process.exit(1);
  });
