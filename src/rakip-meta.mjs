#!/usr/bin/env node
/**
 * npm run rakip-meta [-- --deneme]
 *
 * Meta reklam kütüphanesinde (Facebook + Instagram) Türkiye'de AÇIK olan,
 * bizim işimize benzeyen reklamlar: "web sitesi", "web tasarım", "qr menü"…
 *
 * Tutan reklam işareti (videodaki yöntem): uzun süredir açık + çok varyasyon
 * (collationCount). Türkiye'de kapanmış ticari reklamlar kütüphanede
 * GÖRÜNMEZ (yalnız AB/İngiltere'de bir yıl saklanıyor); bu yüzden "reklamı
 * durdurmuş işletme" araması burada yapılamaz.
 *
 * Çıktı: veri/rakip-meta/<tarih>.json + ekrana en uzun süredir açık olanlar.
 * Maliyet: apify/facebook-ads-scraper, ücretsiz planda 5,80 $ / 1.000 reklam.
 * 4 arama × 60 reklam = 240 ≈ 1,40 $. Ayda bir çalıştırmak yeter.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DENEME, KOK, VERI, alanAdi, bugun, calistir } from "./apify.mjs";

const ayar = JSON.parse(readFileSync(join(KOK, "ayarlar/rakipler.json"), "utf8")).meta;
const kutuphane = (q) =>
  `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${ayar.ulke}&media_type=all&search_type=keyword_unordered&q=${encodeURIComponent(q)}`;
const enCok = ayar.aramalar.length * ayar.aramaBasinaEnCok;

const ogeler = await calistir(
  "apify/facebook-ads-scraper",
  {
    startUrls: ayar.aramalar.map((q) => ({ url: kutuphane(q) })),
    resultsLimit: ayar.aramaBasinaEnCok,
    activeStatus: "active",
    isDetailsPerAd: false,
    includeAboutPage: false,
    enrichWithEcommerceData: false,
  },
  { tahminUsd: (enCok * 5.8) / 1000, sinirUsd: 1.5, zamanAsimiSn: 900 },
);
if (DENEME) process.exit(0);

const simdi = Date.now();
const reklamlar = ogeler.map((o) => {
  const bas = o.startDateFormatted ?? (o.startDate ? new Date(o.startDate * 1000).toISOString() : null);
  return {
    sayfa: o.pageName,
    basladi: bas,
    gundurAcik: bas ? Math.round((simdi - Date.parse(bas)) / 86400000) : null,
    varyasyon: o.collationCount ?? 1,
    platform: o.publisherPlatform ?? [],
    metin: o.snapshot?.body?.text ?? o.snapshot?.cards?.[0]?.body ?? "",
    hedef: alanAdi(o.snapshot?.linkUrl ?? o.snapshot?.cards?.[0]?.linkUrl ?? ""),
    eylem: o.snapshot?.ctaText ?? o.snapshot?.cards?.[0]?.ctaText ?? "",
    kutuphane: o.adArchiveID ? `https://www.facebook.com/ads/library/?id=${o.adArchiveID}` : null,
  };
});

const tarih = bugun();
mkdirSync(join(VERI, "rakip-meta"), { recursive: true });
writeFileSync(join(VERI, "rakip-meta", `${tarih}.json`), JSON.stringify({ tarih, reklamlar }, null, 2));

/* Puan: açık kaldığı gün × varyasyon — ikisi birden yüksekse güçlü işaret */
const puanli = reklamlar.map((r) => ({ ...r, puan: (r.gundurAcik ?? 0) * Math.max(1, r.varyasyon) }));
console.log(`\n${tarih}: Türkiye'de açık ${reklamlar.length} reklam. En güçlü işaretler:`);
for (const r of puanli.sort((a, b) => b.puan - a.puan).slice(0, 15)) {
  console.log(`  ${String(r.gundurAcik ?? "?").padStart(4)} gün × ${r.varyasyon}  ${r.sayfa}  → ${r.hedef || "?"}  ${r.eylem}  ${r.metin.replace(/\s+/g, " ").slice(0, 70)}`);
}
