# Kurulum Talimatları

## 1) Bu dosyaları GitHub reponuza ekleyin
Repo kök dizinine şu yapı ile kopyalayın:
```
package.json
index.js
.gitignore
.github/workflows/rss-bot.yml
docs/index.html      <- Yönetim paneliniz (site)
```

## 1.1) Yönetim panelini yayına alın (GitHub Pages)
1. Repo → **Settings → Pages**
2. "Build and deployment" → Source: **Deploy from a branch**
3. Branch: `main` (veya kullandığınız branch), klasör: **/docs** → Save
4. Birkaç dakika sonra `https://KULLANICI_ADINIZ.github.io/REPO_ADINIZ/` adresinde paneliniz yayında olacak
5. Panelde **e-posta/şifre ile "Hesap Oluştur"**a tıklayıp kendinize giriş bilgisi oluşturun (bu, sadece siz kaynak ekleyebilesiniz diye var — herkes siteyi görse de giriş yapamadan kaynak ekleyemez/silemez)

**Önemli:** Supabase panelinde e-posta onayını kapatmazsanız, kayıt olduktan sonra size gelen onay e-postasını tıklamadan giriş yapamayabilirsiniz. Kolaylık için:
- Supabase Dashboard → Authentication → Providers → Email → **"Confirm email"** seçeneğini kapatın (bu panel sadece sizin kullanımınız için olduğundan güvenlik açığı yaratmaz)

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

## Kaynakları yönetmek
Artık kod veya Supabase paneline girmenize gerek yok — kendi sitenizden (adım 1.1) yönetiyorsunuz:
- **Yeni Kaynak Ekle**: Kaynak Adı, Kaynak Türü (Otomatik Algıla / RSS / Atom / YouTube / Dailymotion / Vimeo), URL, Blogger Etiketi/Kategorisi (elle yazdığınız bu değer her zaman esas alınır), Bir Çalışmada Kaç İçerik, Kontrol Aralığı
- **Durdur / Etkinleştir**: kaynağı silmeden geçici olarak kapatabilirsiniz
- **Sil**: kaynağı tamamen kaldırır
- **Toplam Yayın**: şimdiye kadar Blogger'a atılan toplam yazı sayısını gösterir

### Video kaynakları (YouTube / Dailymotion / Vimeo)
Bu kaynaklardan gelen videolar, Blogger yazısının içine **duyarlı (mobil uyumlu) bir video oynatıcı** olarak otomatik gömülür — sadece link değil, oynatılabilir video.
- **YouTube**: `https://www.youtube.com/feeds/videos.xml?channel_id=KANAL_ID` formatını kullanın. Kanal ID'sini kanalın "Hakkında" sayfasından veya sayfa kaynağından alabilirsiniz.
- **Dailymotion**: `https://www.dailymotion.com/rss/user/KULLANICI_ADI`
- **Vimeo**: `https://vimeo.com/KULLANICI_ADI/videos/rss`
- Panelde "Kaynak Türü"nü **Otomatik Algıla** bırakırsanız script, URL'e bakarak türü kendisi anlar.

## Önemli notlar (dürüst uyarılar)
- GitHub Actions'ın `schedule` tetikleyicisi **garanti dakikasında** çalışmaz; yoğun saatlerde birkaç dakika gecikebilir. Bu yüzden 5 dakikalık cron kullanıp gerçek sıklığı veritabanından okuyoruz — en güvenilir yöntem budur.
- GitHub, 60 gün boyunca hiç commit/push olmayan repolarda zamanlanmış workflow'ları **otomatik durdurur**. Aktif tutmak için ara sıra repoya küçük bir commit atmanız veya "workflow_dispatch" ile elle tetiklemeniz yeterli.
- "Sıfır hata" garantisi hiçbir sistem için mümkün değil, ama script her feed'i ve her yazıyı ayrı ayrı try/catch içinde işliyor: bir kaynak veya yazı hata verse bile diğerleri etkilenmez, hatalar `run_logs` tablosuna kaydedilir.
