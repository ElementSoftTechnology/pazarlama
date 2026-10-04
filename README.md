# pazarlama

EOT'nin pazarlama veri hattı: Google'da sıramız, rakiplerin Google ve Meta
reklamları, haftalık özet. **Yol haritası ve kurallar burada değil:**
`el-kitabi/20-pazarlama/kayitlar/buyume-sistemi-2026-10.md`.

## Kurulum (bir kez)

1. [apify.com](https://apify.com) üzerinde **tek** hesap açın (ücretsiz plan, ayda 5 $ kredi).
   Birden fazla hesap Apify koşullarına aykırıdır (§4.3) ve hesapların silinmesine yol açar.
2. Apify Console → Settings → API & Integrations → **Personal API token** kopyalayın.
3. `.env.ornek` dosyasını `.env.local` adıyla kopyalayın, `APIFY_TOKEN=` satırına yapıştırın.
4. Node 22 ve üstü yeter; paket kurulumu yok.

## Komutlar

| Komut | Ne yapar | Tahmini maliyet | Ne sıklıkla |
|---|---|---|---|
| `npm run sira` | 30 kelimede Google sıramız (telefon, Türkiye, ilk 30) | ≈ 0,16 $ | Haftada bir |
| `npm run rakip-google` | Rakiplerin Google reklamları, kaç gündür gösterildiği | ≈ 0,02 $ | Haftada bir |
| `npm run rakip-meta` | Meta'da Türkiye'de açık "web sitesi / web tasarım / qr menü" reklamları | ≈ 1,40 $ | Ayda bir |
| `npm run rapor` | Son ölçümlerden haftalık özet (`veri/rapor/<tarih>.md`) | ücretsiz | Haftada bir |
| `npm run haftalik` | Dördü birden | ≈ 1,60 $ | Meta'yı ayda bir isterseniz tek tek çalıştırın |

Her komut `-- --deneme` ile çalıştırılırsa istek atmaz; girdiyi ve tahmini
maliyeti basar: `npm run sira -- --deneme`.

Aylık tahmini Apify harcaması: 4 × (0,16 + 0,02) + 1,40 ≈ **2,1 $** / 5 $.

## Dosyalar

| Yer | Ne |
|---|---|
| `ayarlar/kelimeler.json` | Sırası ölçülen kelimeler ve beklenen sayfa |
| `ayarlar/rakipler.json` | İzlenen rakip alan adları, Meta'da aranan kelimeler |
| `src/apify.mjs` | Apify'a giden tek kapı: harcama sınırı, kayıt (`veri/apify-kayit.jsonl`) |
| `src/sira.mjs`, `src/rakip-google.mjs`, `src/rakip-meta.mjs` | Ölçümler |
| `src/rapor.mjs` | Haftalık özet |
| `veri/` | Bütün çıktılar. **Git dışı** |

## Kurallar

- Apify'a yalnız kamuya açık bilgi gider: kelime, rakip alan adı, işletme adı. Talep formundan gelen ad ve telefon gibi kişisel veri **gönderilmez**.
- Reklam hesaplarına (Google Ads, Meta) yalnız **okuma** yetkisiyle bağlanılır. Kampanya açan, bütçe değiştiren otomasyon kurulmaz.
- Türkiye'de Meta reklam kütüphanesi yalnız **açık** ticari reklamları gösterir; kapanmış reklam görülmez.
