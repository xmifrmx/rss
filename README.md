# Hamdi Oto RSS → Blogger

GitHub Pages (panel: `index.html`) + Google Apps Script (bot ve API: `apps-script/Code.gs`). Supabase yok.

1. **GitHub Pages:** bu klasörü bir repoya yükle → Settings → Pages → Branch `main` / root.
2. **Apps Script:** script.google.com → Yeni proje → `Code.gs` içeriğini yapıştır; Proje ayarları → "appsscript.json manifest dosyasını göster" → `appsscript.json` içeriğini yapıştır.
3. **Giriş bilgileri:** Proje ayarları → *Komut dosyası özellikleri* → iki özellik ekle: `ADMIN_EMAIL` (e-postan) ve `ADMIN_PASSWORD` (güçlü bir şifre). Şifre kodda ve GitHub'da hiçbir yerde bulunmaz.
4. Editörde `kurulum` fonksiyonunu çalıştır, izinleri onayla.
5. **Blogger API:** Proje ayarları → Google Cloud Platform projesi → "Projeyi değiştir" ile Cloud proje numarasını gir (OAuth istemci kimliğin `290017525033-…` ile başladığı için proje numarası **290017525033**); o projede *Blogger API v3*'ü etkinleştir (OAuth onay ekranı: Harici/Test, kendi hesabını test kullanıcısı yap).
6. Dağıt → Yeni dağıtım → Web uygulaması → Çalıştıran: Ben, Erişim: Herkes → URL'yi kopyala.
7. Panele gir (URL + e-posta + şifre) → Ayarlar'dan Blog ID zaten tanımlı (2141149813172676021, mifrm.blogspot.com) → "Blogger bağlantısını sına" → Kaynak ekle.

Koda değişiklik yaptığında: Dağıt → Dağıtımları yönet → düzenle → Yeni sürüm.
