# Blogger RSS Bot (Supabase + GitHub Actions)

Sınırsız sayıda RSS adresi ekleyebildiğin, her feed için ayrı zamanlama /
etiket / kategori belirleyebildiğin, tamamen kendi altyapında (GitHub +
Supabase) çalışan bir Blogger otomasyon botu.

**Kullanılan tek "API"**, Blogger'a yazı atmanın tek resmi/yasal yolu olan
Google'ın kendi **Blogger API v3**'üdür. IFTTT, Zapier, RSS.app gibi bir
ücretli/aracı üçüncü parti servis kullanılmaz. Bunun dışındaki tüm parçalar
(RSS okuma, veri saklama) kendi Supabase veritabanında ve kendi GitHub
reponda çalışır.

## Nasıl çalışır?

1. Supabase'teki `feeds` tablosuna istediğin kadar RSS adresi eklersin.
2. GitHub Actions her 10 dakikada bir otomatik tetiklenir.
3. Script, zamanı gelen (kendi `interval_minutes` değerine göre) feed'leri
   okur, henüz paylaşılmamış yeni içerikleri bulur ve Blogger'da otomatik
   yazı olarak yayınlar (etiket/kategori dahil).
4. Paylaşılan her içerik `posted_items` tablosuna kaydedilir, böylece aynı
   yazı bir daha paylaşılmaz.

## Kurulum

### 1) Supabase tarafı

1. https://supabase.com üzerinde ücretsiz bir proje oluştur.
2. Sol menüden **SQL Editor** aç, `supabase-schema.sql` dosyasının içeriğini
   yapıştırıp **Run** de. Bu, `feeds` ve `posted_items` tablolarını oluşturur.
3. **Project Settings > API** sayfasından şunları not al:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` anahtarı → `SUPABASE_SERVICE_KEY` (⚠️ bunu asla halka
     açık paylaşma, sadece GitHub Secrets'a koyacaksın)

### 2) Blogger / Google tarafı (Blogger API bilgileri)

Blogger'a otomatik yazı atabilmek için Google'ın sana bir kere yetki
vermesi gerekiyor. Bu tek seferlik bir işlem:

1. https://console.cloud.google.com adresinde yeni bir proje oluştur.
2. **APIs & Services > Library** kısmından **Blogger API v3**'ü aktif et.
3. **APIs & Services > Credentials > Create Credentials > OAuth client ID**
   ile "Desktop app" tipinde bir istemci oluştur. Sana `Client ID` ve
   `Client Secret` verecek → bunları not al.
4. `refresh_token` almak için (tek seferlik, tarayıcıda):
   - Şu adresi kendi `CLIENT_ID`'inle tarayıcıda aç:
     ```
     https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/blogger&access_type=offline&prompt=consent
     ```
   - Google hesabınla giriş yap, izin ver, sana bir **kod** verecek.
   - Aşağıdaki komutu terminalde (curl ile) çalıştırıp o kodu değiştir:
     ```bash
     curl -X POST https://oauth2.googleapis.com/token \
       -d client_id=CLIENT_ID \
       -d client_secret=CLIENT_SECRET \
       -d code=YAPIŞTIRDIĞIN_KOD \
       -d grant_type=authorization_code \
       -d redirect_uri=urn:ietf:wg:oauth:2.0:oob
     ```
   - Dönen JSON içindeki `refresh_token` değerini not al → `BLOGGER_REFRESH_TOKEN`
5. Blogunun ID'sini bulmak için: Blogger panelinde blogunu aç, adres
   çubuğundaki `blogID=...` parametresine bak, ya da
   `https://www.googleapis.com/blogger/v3/blogs/byurl?url=BLOG_ADRESIN&key=...`
   ile sorgula. En kolayı: Blogger ayarlarında **Ayarlar > Temel** altında
   "Blog Kimliği" yazar.

### 3) GitHub tarafı

1. Bu klasördeki dosyaları yeni bir GitHub reposuna yükle.
2. Repo **Settings > Secrets and variables > Actions > New repository secret**
   yolundan şu secret'ları tek tek ekle:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `BLOGGER_CLIENT_ID`
   - `BLOGGER_CLIENT_SECRET`
   - `BLOGGER_REFRESH_TOKEN`
   - `BLOG_ID`
3. **Actions** sekmesine gidip workflow'u bir kez elle çalıştır
   (`Run workflow` butonu) — sorunsuz çalıştığını göreceksin. Sonrasında
   otomatik olarak her 10 dakikada bir kendiliğinden çalışacak.

> Not: GitHub Actions'ın ücretsiz planında cron zamanlamaları bazen birkaç
> dakika gecikebilir, bu normaldir; workflow her tetiklendiğinde tüm
> feed'leri kontrol edip zamanı gelenleri işler.

## RSS kaynağı ekleme / yönetme

Kod hiç dokunmadan, doğrudan Supabase panelinden **Table Editor > feeds**
üzerinden satır ekleyerek/düzenleyerek yönetilir:

| Alan | Açıklama |
|---|---|
| `url` | RSS/Atom besleme adresi |
| `labels` | Blogger etiket/kategorileri, virgülle: `haber, teknoloji` |
| `interval_minutes` | Bu kaynak kaç dakikada bir kontrol edilsin (örn. 30, 60, 120) |
| `max_items_per_run` | Her çalıştırmada en fazla kaç yeni yazı paylaşılsın (spam'i önler) |
| `active` | `false` yaparsan o kaynak geçici olarak durur |

İstediğin kadar satır (RSS adresi) ekleyebilirsin, bir sınır yoktur.

## Taslak olarak paylaşmak istersen

Workflow dosyasındaki `POST_AS_DRAFT: "false"` değerini `"true"` yaparsan,
bot yazıları doğrudan yayınlamak yerine Blogger'da taslak olarak bırakır,
sen onaylayıp yayına alırsın.

## Dosya yapısı

```
.
├── index.js                        # Ana bot mantığı
├── package.json                    # Node bağımlılıkları
├── supabase-schema.sql             # Supabase tablo şeması
├── .github/workflows/rss-bot.yml   # Otomatik çalıştırma (cron)
└── README.md
```
