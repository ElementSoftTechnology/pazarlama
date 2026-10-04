#!/usr/bin/env node
/**
 * npm run rakip-google [-- --deneme]
 *
 * Rakiplerin Google reklamları — Google Reklam Şeffaflık Merkezi'nden
 * (adstransparency.google.com), Türkiye bölgesi. Her reklamın ilk ve son
 * gösterim tarihi gelir: UZUN SÜRE gösterilen reklam büyük olasılıkla
 * işe yarıyordur (kesin değil, işaret). Kendi Ads metinlerimizi bununla sınarız.
 *
 * Çıktı: veri/rakip-google/<tarih>.json + ekrana en uzun süre açık kalanlar.
 * Maliyet: automation-lab/google-ads-transparency-center-scraper, 1.000 öğe
 * başına birkaç sent; 8 rakip × 30 reklam ≈ 0,01-0,05 $.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DENEME, KOK, VERI, bugun, calistir } from "./apify.mjs";

const ayar = JSON.parse(readFileSync(join(KOK, "ayarlar/rakipler.json"), "utf8")).google;
const enCok = ayar.alanAdlari.length * ayar.rakipBasinaEnCok;

const ogeler = await calistir(
  "automation-lab/google-ads-transparency-center-scraper",
  /* Süzgeç `regionCriteriaId` ile (Google konum kimliği; Türkiye 2792). `regionCode` yalnız çıktıya yazılan etiket */
  { queries: ayar.alanAdlari, searchMode: "creatives", regionCriteriaId: ayar.bolgeKimligi, regionCode: ayar.bolge, maxItems: enCok },
  { tahminUsd: (enCok * 0.06) / 1000 + 0.01, sinirUsd: 0.2 },
);
if (DENEME) process.exit(0);

/* Alan adları aktörden aktöre farklı adlandırılabiliyor; birkaç adı sırayla dene */
const al = (o, ...adlar) => adlar.map((a) => o?.[a]).find((v) => v !== undefined && v !== null && v !== "");
const gun = (a, b) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1 : null);

const reklamlar = ogeler.map((o) => {
  const ilk = al(o, "firstShownAt", "firstShown", "firstShownDate");
  const son = al(o, "lastShownAt", "lastShown", "lastShownDate");
  return {
    reklamveren: al(o, "advertiserName", "advertiser", "advertiser_name"),
    alanAdi: al(o, "landingDomain", "domain", "targetDomain"),
    bicim: al(o, "format", "adFormat"),
    ilk,
    son,
    gun: al(o, "daysShown", "days_shown") ?? gun(ilk, son),
    metin: al(o, "text", "adText", "headline", "title"),
    /* Reklamların çoğu metin değil görsel: metni görselde okunur */
    gorsel: al(o, "imageUrl"),
    gosterimAlt: al(o, "impressionLowerBound"),
    adres: al(o, "sourceUrl", "url", "creativeUrl"),
  };
});

const tarih = bugun();
mkdirSync(join(VERI, "rakip-google"), { recursive: true });
writeFileSync(join(VERI, "rakip-google", `${tarih}.json`), JSON.stringify({ tarih, reklamlar, ham: ogeler }, null, 2));

console.log(`\n${tarih}: ${reklamlar.length} rakip reklamı. En uzun gösterilenler:`);
for (const r of [...reklamlar].sort((a, b) => (b.gun ?? 0) - (a.gun ?? 0)).slice(0, 15)) {
  console.log(`  ${String(r.gun ?? "?").padStart(4)} gün  ${r.reklamveren ?? r.alanAdi}  ${r.bicim ?? ""}  ${(r.metin ?? "").slice(0, 80)}`);
}
