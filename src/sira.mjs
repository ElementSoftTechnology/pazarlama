#!/usr/bin/env node
/**
 * npm run sira [-- --deneme]
 *
 * `ayarlar/kelimeler.json` içindeki her kelimede Google Türkiye'de (telefon
 * sonuçları, Türkçe) ilk 30 sonuca bakar: sitemiz kaçıncı, hangi sayfamız
 * çıkıyor, ilk üçte kim var.
 *
 * Çıktı:
 *   veri/sira/<tarih>.json   o günün tam ölçümü
 *   veri/sira/gecmis.csv     tarih;kelime;sira;sayfa — haftadan haftaya karşılaştırma
 *
 * Maliyet: apify/google-search-scraper, 1,80 $ / 1.000 sonuç sayfası.
 * 30 kelime × 3 sayfa = 90 sayfa ≈ 0,16 $ / ölçüm.
 *
 * Sınır: konum Ankara'ya sabitlenmedi (Türkiye geneli). Ankara'daki biri için
 * yerel sonuçlar biraz farklı olabilir; eğilim için yeterli.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DENEME, KOK, VERI, alanAdi, bugun, calistir } from "./apify.mjs";

const ayar = JSON.parse(readFileSync(join(KOK, "ayarlar/kelimeler.json"), "utf8"));
const SAYFA = 3;
const sayfaSayisi = ayar.kelimeler.length * SAYFA;

const sonuclar = await calistir(
  "apify/google-search-scraper",
  {
    queries: ayar.kelimeler.map((k) => k.kelime).join("\n"),
    countryCode: "tr",
    languageCode: "tr",
    searchLanguage: "tr",
    mobileResults: true,
    maxPagesPerQuery: SAYFA,
    resultsPerPage: 10,
    saveHtml: false,
    saveHtmlToKeyValueStore: false,
  },
  { tahminUsd: (sayfaSayisi * 1.8) / 1000, sinirUsd: 0.5, zamanAsimiSn: 600 },
);
if (DENEME) process.exit(0);

/* Her öğe bir sonuç SAYFASI: searchQuery.term + searchQuery.page + organicResults[] */
const kelimeBasi = new Map();
for (const s of sonuclar) {
  const terim = s.searchQuery?.term;
  const sayfaNo = s.searchQuery?.page ?? 1;
  if (!terim) continue;
  const liste = kelimeBasi.get(terim) ?? [];
  for (const o of s.organicResults ?? []) liste.push({ sira: (sayfaNo - 1) * 10 + (o.position ?? 0), adres: o.url, baslik: o.title });
  kelimeBasi.set(terim, liste.sort((a, b) => a.sira - b.sira));
}

const tarih = bugun();
const olcum = ayar.kelimeler.map(({ kelime, sayfa }) => {
  const liste = kelimeBasi.get(kelime) ?? [];
  const bizim = liste.find((x) => alanAdi(x.adres) === ayar.alanAdi);
  return {
    kelime,
    beklenenSayfa: sayfa,
    sira: bizim?.sira ?? null,
    cikanSayfa: bizim ? new URL(bizim.adres).pathname : null,
    ilkUc: liste.slice(0, 3).map((x) => alanAdi(x.adres)),
    olculenSonuc: liste.length,
  };
});

const klasor = join(VERI, "sira");
mkdirSync(klasor, { recursive: true });
writeFileSync(join(klasor, `${tarih}.json`), JSON.stringify({ tarih, olcum }, null, 2));
const csv = join(klasor, "gecmis.csv");
if (!existsSync(csv)) appendFileSync(csv, "﻿tarih;kelime;sira;cikan_sayfa\n");
for (const o of olcum) appendFileSync(csv, `${tarih};${o.kelime};${o.sira ?? ""};${o.cikanSayfa ?? ""}\n`);

const ilk30 = olcum.filter((o) => o.sira !== null);
console.log(`\n${tarih}: ${olcum.length} kelimenin ${ilk30.length} tanesinde ilk 30'dayız.`);
for (const o of olcum) console.log(`  ${String(o.sira ?? "—").padStart(3)}  ${o.kelime}${o.cikanSayfa && o.cikanSayfa !== o.beklenenSayfa ? `  (çıkan: ${o.cikanSayfa})` : ""}`);
