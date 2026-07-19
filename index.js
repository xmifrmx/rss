/**
 * Blogger RSS Bot — Supabase destekli, üçüncü taraf servis kullanmadan çalışır.
 * - RSS listesi, etiket/kategori ve zamanlama ayarları Supabase'te tutulur.
 * - Yayınlama işlemi doğrudan Google'ın resmi Blogger API v3'ü ile yapılır
 *   (Blogger'a yazı atmanın tek resmi yolu budur, IFTTT/Zapier gibi bir
 *   üçüncü parti servis KULLANILMAZ).
 * - GitHub Actions üzerinde zamanlanmış (cron) olarak çalışır.
 */

const { createClient } = require("@supabase/supabase-js");
const Parser = require("rss-parser");

// ---- Ortam değişkenleri (GitHub Secrets üzerinden gelir) ----
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  BLOGGER_CLIENT_ID,
  BLOGGER_CLIENT_SECRET,
  BLOGGER_REFRESH_TOKEN,
  BLOG_ID,
  POST_AS_DRAFT, // "true" verilirse taslak olarak eklenir
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Eksik ortam değişkeni: ${name}`);
    process.exit(1);
  }
}
[
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_KEY", SUPABASE_SERVICE_KEY],
  ["BLOGGER_CLIENT_ID", BLOGGER_CLIENT_ID],
  ["BLOGGER_CLIENT_SECRET", BLOGGER_CLIENT_SECRET],
  ["BLOGGER_REFRESH_TOKEN", BLOGGER_REFRESH_TOKEN],
  ["BLOG_ID", BLOG_ID],
].forEach(([n, v]) => requireEnv(n, v));

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const parser = new Parser({
  customFields: {
    item: [["content:encoded", "contentEncoded"]],
  },
});

// ---- Google OAuth2 refresh token ile access token al ----
async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: BLOGGER_CLIENT_ID,
      client_secret: BLOGGER_CLIENT_SECRET,
      refresh_token: BLOGGER_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google token alınamadı: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// ---- Blogger'a yazı gönder ----
async function publishToBlogger({ accessToken, title, content, labels }) {
  const url = `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts${
    POST_AS_DRAFT === "true" ? "?isDraft=true" : ""
  }`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      kind: "blogger#post",
      title,
      content,
      labels: labels && labels.length ? labels : undefined,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Blogger yayınlama hatası: ${JSON.stringify(data)}`);
  }
  return data;
}

// ---- Bir RSS öğesinin içeriğini hazırla ----
function buildContent(item) {
  const body =
    item.contentEncoded || item.content || item.contentSnippet || "";
  const sourceLine = item.link
    ? `<p><a href="${item.link}" target="_blank" rel="nofollow noopener">Kaynağı görüntüle</a></p>`
    : "";
  return `${body}${sourceLine}`;
}

function itemGuid(item) {
  return item.guid || item.id || item.link || item.title;
}

// ---- Ana çalışma döngüsü ----
async function run() {
  console.log("RSS bot başladı:", new Date().toISOString());

  // Aktif feed'leri çek
  const { data: feeds, error: feedsError } = await supabase
    .from("feeds")
    .select("*")
    .eq("active", true);

  if (feedsError) {
    console.error("Feed listesi alınamadı:", feedsError);
    process.exit(1);
  }

  if (!feeds || feeds.length === 0) {
    console.log("Aktif RSS bulunamadı. Çıkılıyor.");
    return;
  }

  const now = new Date();
  const dueFeeds = feeds.filter((f) => {
    if (!f.last_checked) return true;
    const last = new Date(f.last_checked);
    const diffMinutes = (now - last) / 60000;
    return diffMinutes >= (f.interval_minutes || 60);
  });

  if (dueFeeds.length === 0) {
    console.log("Zamanı gelen feed yok. Çıkılıyor.");
    return;
  }

  let accessToken = null;

  for (const feed of dueFeeds) {
    console.log(`\nFeed işleniyor: ${feed.url}`);
    let parsed;
    try {
      parsed = await parser.parseURL(feed.url);
    } catch (err) {
      console.error(`  Feed okunamadı (${feed.url}):`, err.message);
      continue;
    }

    const items = (parsed.items || []).slice(0, feed.max_items_per_run || 5);

    for (const item of items.reverse()) {
      const guid = itemGuid(item);
      if (!guid) continue;

      // Zaten paylaşılmış mı kontrol et
      const { data: existing } = await supabase
        .from("posted_items")
        .select("id")
        .eq("feed_id", feed.id)
        .eq("guid", guid)
        .maybeSingle();

      if (existing) {
        continue; // zaten paylaşılmış
      }

      try {
        if (!accessToken) accessToken = await getAccessToken();

        const labels = (feed.labels || "")
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean);

        const result = await publishToBlogger({
          accessToken,
          title: item.title || "(başlıksız)",
          content: buildContent(item),
          labels,
        });

        console.log(`  Yayınlandı: ${item.title} -> ${result.url}`);

        await supabase.from("posted_items").insert({
          feed_id: feed.id,
          guid,
          title: item.title,
          link: item.link,
        });
      } catch (err) {
        console.error(`  Yayınlama hatası (${item.title}):`, err.message);
      }
    }

    // last_checked güncelle
    await supabase
      .from("feeds")
      .update({ last_checked: now.toISOString() })
      .eq("id", feed.id);
  }

  console.log("\nRSS bot bitti:", new Date().toISOString());
}

run().catch((err) => {
  console.error("Beklenmeyen hata:", err);
  process.exit(1);
});
