# Hamdi Oto RSS → Blogger

GitHub Pages (panel: `index.html`) + Google Apps Script (bot ve API: `apps-script/Code.gs`). Supabase yok.

1. **GitHub Pages:** bu klasörü bir repoya yükle → Settings → Pages → Branch `main` / root.
2. **Apps Script:** script.google.com → Yeni proje → `Code.gs` içeriğini yapıştır; Proje ayarları → "appsscript.json manifest dosyasını göster" → `appsscript.json` içeriğini yapıştır.
3. Editörde `kurulum` fonksiyonunu çalıştır, izinleri onayla.
4. **Blogger API:** Proje ayarları → Google Cloud Platform projesi → "Projeyi değiştir" ile kendi Cloud proje numaranı gir; o projede *Blogger API v3*'ü etkinleştir (OAuth onay ekranı: Harici/Test, kendi hesabını test kullanıcısı yap).
5. Dağıt → Yeni dağıtım → Web uygulaması → Çalıştıran: Ben, Erişim: Herkes → URL'yi kopyala.
6. Panele gir (URL + e-posta + şifre) → Ayarlar'dan Blog ID'yi yaz → "Blogger bağlantısını sına" → Kaynak ekle.

Koda değişiklik yaptığında: Dağıt → Dağıtımları yönet → düzenle → Yeni sürüm.
