# Kurulum Talimatları

## 1) Bu dosyaları GitHub reponuza ekleyin
Repo kök dizinine şu yapı ile kopyalayın:
```
package.json
index.js
.gitignore
.github/workflows/rss-bot.yml
```

## 2) Supabase (zaten hazır)
Proje oluşturuldu: **hamdi-oto-rss**
- URL: `https://bifeqxwsatpgfqdvufvn.supabase.co`
- `feeds`, `sent_posts`, `run_logs` tabloları kuruldu, 7 mevcut RSS kaynağınız eklendi.

**SERVICE ROLE anahtarını almanız gerekiyor** (ben sadece herkese açık "anon" anahtarı çekebiliyorum, gizli service_role anahtarını güvenlik gereği sadece siz görebilirsiniz):
1. https://supabase.com/dashboard/project/bifeqxwsatpgfqdvufvn/settings/api adresine gidin
2. "Project API keys" bölümünde **service_role** anahtarını kopyalayın (⚠️ gizli tutun, herkese açık paylaşmayın)

## 3) Blogger için Google OAuth bilgileri
1. https://console.cloud.google.com/ → yeni proje (veya mevcut) seçin
2. "APIs & Services" → "Library" → **Blogger API v3**'ü etkinleştirin
3. "APIs & Services" → "Credentials" → "Create Credentials" → **OAuth client ID** → Uygulama türü: **Desktop app**
4. Oluşan **Client ID** ve **Client Secret**'ı not edin
5. Refresh token almak için en kolay yol Google OAuth Playground:
   - https://developers.google.com/oauthplayground adresine gidin
   - Sağ üstte dişli ikonuna tıklayıp "Use your own OAuth credentials" işaretleyin, Client ID/Secret'ı girin
   - Sol tarafta "Blogger API v3" bulup `https://www.googleapis.com/auth/blogger` yetkisini seçin
   - "Authorize APIs" → kendi Google hesabınızla (Blogger'ın bağlı olduğu hesap) giriş yapıp izin verin
   - "Exchange authorization code for tokens" tıklayın → çıkan **Refresh token**'ı kopyalayın

## 4) Blog ID'niz
Zaten script'te vardı: `2141149813172676021`

## 5) GitHub Secrets ekleyin
Reponuzda: Settings → Secrets and variables → Actions → "New repository secret"

| Secret adı | Değer |
|---|---|
| `SUPABASE_URL` | `https://bifeqxwsatpgfqdvufvn.supabase.co` |
| `SUPABASE_SERVICE_KEY` | (adım 2'de aldığınız service_role anahtarı) |
| `BLOG_ID` | `2141149813172676021` |
| `GOOGLE_CLIENT_ID` | (adım 3) |
| `GOOGLE_CLIENT_SECRET` | (adım 3) |
| `GOOGLE_REFRESH_TOKEN` | (adım 3) |

## 6) Test edin
- GitHub reponuzda "Actions" sekmesine gidin
- "RSS to Blogger Bot" workflow'unu seçip **"Run workflow"** ile manuel tetikleyin
- Loglardan hatasız çalıştığını doğrulayın
- Sonrasında otomatik olarak 5 dakikada bir tetiklenecek (her feed kendi `interval_minutes` süresine göre işlenecek)

## Feed'leri veya zamanlamayı değiştirmek
Kod değiştirmenize gerek yok — Supabase panelinden `feeds` tablosunu düzenleyin:
- Yeni kaynak eklemek: yeni satır ekleyin (`url`, `etiket`, `interval_minutes`, `aktif=true`)
- Bir kaynağı durdurmak: `aktif = false` yapın
- Sıklığı değiştirmek: `interval_minutes` değerini değiştirin (5, 10, 20, 30, 60, 120 gibi dakika cinsinden)

## Önemli notlar (dürüst uyarılar)
- GitHub Actions'ın `schedule` tetikleyicisi **garanti dakikasında** çalışmaz; yoğun saatlerde birkaç dakika gecikebilir. Bu yüzden 5 dakikalık cron kullanıp gerçek sıklığı veritabanından okuyoruz — en güvenilir yöntem budur.
- GitHub, 60 gün boyunca hiç commit/push olmayan repolarda zamanlanmış workflow'ları **otomatik durdurur**. Aktif tutmak için ara sıra repoya küçük bir commit atmanız veya "workflow_dispatch" ile elle tetiklemeniz yeterli.
- "Sıfır hata" garantisi hiçbir sistem için mümkün değil, ama script her feed'i ve her yazıyı ayrı ayrı try/catch içinde işliyor: bir kaynak veya yazı hata verse bile diğerleri etkilenmez, hatalar `run_logs` tablosuna kaydedilir.
