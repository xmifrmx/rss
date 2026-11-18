# Tarihte Bugün – Otomatik Dünya Tarihi RSS

GitHub Pages + GitHub Actions ile çalışır; sunucu ve ücretli API gerekmez. Her gün Vikipedi'nin
**MediaWiki Action API**'sinden (`tr.wikipedia.org` ve `en.wikipedia.org` `/w/api.php`) o güne ait
olay, doğum, ölüm ve tatil/özel günlerin **tamamını** (sayı sınırı yok) okur, her biri için Türkçe, Blogger uyumlu (H1'siz) tam makale üretir ve RSS'i yeniler.

* RSS: https://xmifrmx.github.io/makale/rss.xml
* Aynı içerik: https://xmifrmx.github.io/makale/feed
* Makale sayfaları: `/makale/<tarih>-<slug>.html`, site haritası: `/sitemap.xml`

## Kurulum (5 adım)

1. Bu klasörün içeriğini `xmifrmx/makale` deposuna kopyalayın (mevcut dosyalarınızı **silmez/ezmez**:
   yalnızca `tarihrss/`, `tests/`, `data/`, `assets/kapak-varsayilan.svg`, `makale/`, `.github/workflows/tarih-rss.yml`
   ve üretilen `rss.xml`, `feed`, `sitemap.xml` eklenir). Depoda zaten `README.md`, `.gitignore` varsa birleştirin.
2. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main` / `(root)`.
3. **Settings → Actions → General → Workflow permissions**: *Read and write permissions* seçin.
4. **Actions → "Günlük Tarihte Bugün RSS" → Run workflow** ile ilk çalıştırmayı elle yapın (isterseniz tarih/adet girin).
5. 1–2 dakika sonra `…/makale/rss.xml` adresini açın. Sonrasında her gün 06:17 (TSİ) otomatik çalışır;
   14:47'deki ikinci çalışma sabah alınanları denetler ve **yalnızca eksikleri** ekler/tamamlar (aşağıya bakın).

## Nasıl çalışır

| Adım | Ne yapar |
|---|---|
| Aday toplama | `18 Kasım` (tr) ve `November 18` (en) gün sayfalarının vikimetnini okur (Olaylar/Doğumlar/Ölümler/Tatiller). Ek olarak küratörlü kaynaklar: Türkçe `Vikipedi:Tarihte bugün/<Ay>` projesinin günlük şablonu `Şablon:Tarihte bugün/<G Ay>` (`expandtemplates` ile açılır, iç içe şablonlar ve kalın yıl/`<li>`/`#` biçimleri desteklenir) ve İngilizce `Wikipedia:Selected anniversaries/<Month> <D>`. Hepsi tek havuzda birleşir; aynı konu bir kez yayımlanır. Ek kaynak alınamazsa uyarı verilir, 14:47'de yeniden denenir |
| Seçim | Güne ait **tüm** olaylar, doğumlar, ölümler ve tatil/özel günler alınır (günlük sınır yok; Türkçe maddesi olan her aday). İngilizce gün sayfasındaki olaylar da alınır; cümle çevrilmez, nötr bir giriş cümlesi kullanılır. Sıra; dönem, tür ve dil çeşitliliği gözetilerek karıştırılır |
| Doğrulama kapıları | Doğum/ölüm adayında Türkçe madde **kişi kategorisinde** olmalı (ör. adı bağlantısız satırda ilk bağlantı bir halk/ülke ise alınmaz); olay satırlarında kişi maddesi yerine olay/eser maddesi tercih edilir;  Türkçe Vikipedi maddesi var mı, anlam ayrımı sayfası değil mi, yeterli uzunlukta mı, kapak görseli (≥700 px, bayrak/harita/logo değil) var mı |
| Makale | Kapak görseli → Kısa Özet → (maddenin TÜM metni, karakter sınırı yok; kısa satırlar/listeler ve alt başlıklar dahil:) Tarihî Arka Plan → Olayın Gelişimi → Önemli Kişiler → Dünya Tarihindeki Etkileri → Sonuç → Kaynaklar |
| Tekrar kontrolü | `data/index.json` içinde konu anahtarı + olay kimliği; yıllar arasında da aynı madde ikinci kez yayımlanmaz. Aynı adlı sayfa çıkarsa `-2`, `-3` eklenir; hiçbir makale ezilmez |
| Eksikleri tamamlama (14:47) | Her çalışma bugünün makalelerini denetler: Vikipedi revizyonu değiştiyse ya da sabah bir API arızasıyla bir parça (metin, kişiler, görsel lisansı) eksik kaldıysa makale **aynı kimlik/adres/yayın zamanıyla TEK PARÇA olarak baştan derlenir**; RSS'te parça parça değil bütün makale bulunur. Sabah işlenemeyen adaylar (`data/index.json › days`) yalnızca eksik olarak eklenir; yayımlananlara dokunulmaz |
| Kalıcılık | `data/index.json` (+ `.bak`), gövdeler `data/content/*.html`; hepsi git'e işlenir (git geçmişi de yedektir) |
| Hata yönetimi | `maxlag`, 429/5xx'te üstel geri çekilme, ağ/yarım yanıt/bozuk gzip yeniden denemesi; ardışık hatada üretim durur ve kalanlar sonraki çalışmaya bırakılır; API tamamen kapalıysa mevcut RSS bozulmadan korunur ve iş "başarısız" görünür; görsel yoksa varsayılan kapak |

Başlıklar her koşulda ≤ 70 karakterdir (testle doğrulanır). RSS'te her öğe: `title`, `link`, `guid` (kalıcı),
`pubDate`, `description` (≤155 karakter meta açıklama), `category`, `media:content` ve `content:encoded` içinde **tam makale HTML'i**.
RSS, en yeni günün **tüm** makalelerini her zaman içerir (en az `FEED_ITEMS` öğe).

## Çalışma günlüğü (ÖZET satırları)

Her çalışma sonunda Actions günlüğüne iki `ÖZET` satırı yazılır: havuzdaki aday sayısı (`tr/olay`, `en/dogum`… kaynak ve türe göre), bugün yayımlanan makale sayısı, atlananların nedenleri (`tr_madde_yok`, `kisi_degil`, `kisa_giris`, `anlam_ayrimi`, `metin_kisa`), tekrar (`dup`) ve API hatası nedeniyle bekleyen sayısı. "Her şey çekildi mi" sorusunun cevabı budur; atlanan kayıtların ayrıntısı `data/index.json › days` içindedir.

## Ayarlar (workflow `env:` veya ortam değişkeni)

`ARTICLES_PER_DAY` (0 = sınırsız) · `FEED_ITEMS` (150; en yeni günün tamamı her zaman girer, ≤0 = hepsi) · `MAX_BODY_CHARS` (0 = sınırsız, maddenin tamamı) · `FEED_MAX_MB` (48; rss.xml/feed üst boyutu, aşılırsa en eski öğeler çıkar) · `MAX_EVALUATED` (0 = tüm adaylar) · `MIN_INTRO_CHARS` (60) / `MIN_TOTAL_CHARS` (150): yalnızca boş taslakları eler · `STRICT_EN_EVENTS` (0; 1 = İngilizce olayları yalnızca olay sayfası netse al) · `SITE_URL` · `WIKI_CONTACT` (User-Agent'ta iletişim bilgisi)

## Yerelde deneme

```bash
python -m unittest discover -s tests          # ağsız testler (sahte API)
python -m tarihrss --date 2026-11-18            # gerçek API ile üretim, sınırsız (internet gerekir)
python -m tarihrss --date 2026-11-18 --count 5  # isteğe bağlı üst sınır
```

## Bilmeniz gerekenler

* **Özgünlük:** Üretim sırasında LLM kullanılmaz (ücretsiz/sunucusuz kalması için). Metinler Türkçe Vikipedi
  maddelerinden derlenir; bu yüzden Google'da "özgün içerik" sayılmayabilir. Lisans gereği (CC BY-SA 4.0) her makalede
  kaynak ve lisans notu bulunur. Daha özgün metin isterseniz `article.py` çıktısı ücretsiz bir LLM katmanından geçirilebilir.
* **Depo büyümesi:** Günlük içerik sınırsız olduğundan gün başına onlarca makale (içerik + sayfa) ve büyük bir `rss.xml`/`feed`
  oluşur; git geçmişi zamanla şişer. Gerekirse `FEED_ITEMS` değerini düşürün (günün tamamı yine de girer).
* **Olay cümlesi:** Yalnızca Türkçe gün sayfasındaki olaylar Türkçe cümleyle başlar. İngilizce gün sayfasındaki olaylar,
  yalnızca Türkçe karşılığı net bir "olay maddesi" ise (ör. *… Muharebesi*) kullanılır; çeviri uydurulmaz.
* **Bölge dengesi** anahtar sözcük sezgisine dayanır, kesin değildir.
* **Veri yoksa bölüm yok:** Maddede ilgili içerik bulunmazsa (ör. "Etkileri" bölümü) o başlık atlanır; dolgu metin yazılmaz.
* **`/feed` adresi** uzantısız bir dosyadır; GitHub Pages bunu `application/octet-stream` ile sunabilir. RSS okuyucular
  içeriği tanır, tarayıcı indirme önerebilir. Gerçek başlık/tür gerekirse `rss.xml` kullanın.
* **Blogger:** Blogger RSS'i doğrudan içe aktarmaz; `content:encoded` içindeki HTML'i kendi aktarım aracınızla ya da
  elle yazıya yapıştırarak kullanabilirsiniz (H1 içermez, görsel ve ALT hazırdır).
* Pages dal-kaynaklı değilse (Source = GitHub Actions) yayın adımı farklı olmalıdır; bu iş akışı dal-kaynaklı siteyi varsayar.
