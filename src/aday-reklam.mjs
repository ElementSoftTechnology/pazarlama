#!/usr/bin/env node
/**
 * npm run aday-reklam [-- --adet 20] [-- --deneme]
 *
 * "Parayı zaten harcayan" ölçütü (iş akışı 10-satis/03 §1): aday defterindeki
 * işletmeler Meta reklam kütüphanesinde ADIYLA (tam ifade) aranır. Türkiye'de
 * açık reklamı olan ve sitesi olmayan işletme, aranacaklar listesinin başına
 * geçer. Reklamın gittiği yer de kaydedilir: Instagram profiline giden reklam
 * "site yerine Instagram'a para harcıyor" demektir.
 *
 * Seçim: yüksek fırsatlı (sitesi yok/kötü), son 30 günde kontrol edilmemiş,
 * yorum sayısı en yüksek N işletme. Varsayılan N = 20.
 *
 * Eşleşme kuralı: kütüphane tam ifade aramasında başka sayfaların reklamını da
 * döndürebilir (metninde işletme adı geçen). Yalnız SAYFA ADI işletme adıyla
 * örtüşen reklam sayılır; örtüşmeyenler "belirsiz" olarak ayrı tutulur.
 *
 * Çıktı: veri/aday-reklam.json  { "<aday id>": { kontrol, aktifReklam, ... } }
 * Maliyet: işletme başına en çok 3 reklam × 5,80 $ / 1.000 ≈ 0,017 $;
 * 20 işletme ≈ 0,35 $.
 *
 * Apify'a giden: yalnız işletme adı (Haritalar'da kamuya açık). Kişisel veri yok.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { DENEME, KOK, VERI, alanAdi, bugun, calistir } from "./apify.mjs";

const ADAY = resolve(process.env.ADAY_KLASORU ?? join(KOK, "../aday"));
const DEFTER = join(ADAY, "cikti/_kayit/isletmeler.json");
const CIKTI = join(VERI, "aday-reklam.json");
const TAZELIK_GUN = 30;
const REKLAM_BASINA = 3;

const argAdet = process.argv.indexOf("--adet");
const ADET = argAdet > -1 ? Math.max(1, Math.min(100, Number(process.argv[argAdet + 1]) || 20)) : 20;

if (!existsSync(DEFTER)) {
  console.error(`Aday defteri yok: ${DEFTER}`);
  process.exit(1);
}
const defter = JSON.parse(readFileSync(DEFTER, "utf8")).isletmeler;
const onceki = existsSync(CIKTI) ? JSON.parse(readFileSync(CIKTI, "utf8")) : {};

const taze = (id) => {
  const t = Date.parse(onceki[id]?.kontrol ?? "");
  return Number.isFinite(t) && Date.now() - t < TAZELIK_GUN * 86400000;
};
const secilen = Object.values(defter)
  .filter((i) => i.firsat?.seviye === "yuksek" && i.ad && !taze(i.id))
  .sort((a, b) => (b.yorumSayisi ?? 0) - (a.yorumSayisi ?? 0))
  .slice(0, ADET);

if (secilen.length === 0) {
  console.log("Kontrol edilecek aday yok (hepsi son 30 günde bakılmış).");
  process.exit(0);
}

/* Kütüphane adresi: Türkiye, açık reklamlar, tam ifade */
const kutuphane = (ad) =>
  `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=TR&media_type=all&search_type=keyword_exact_phrase&q=${encodeURIComponent(ad)}`;

const ogeler = await calistir(
  "apify/facebook-ads-scraper",
  {
    startUrls: secilen.map((i) => ({ url: kutuphane(i.ad) })),
    resultsLimit: REKLAM_BASINA,
    activeStatus: "active",
    isDetailsPerAd: false,
    includeAboutPage: false,
    enrichWithEcommerceData: false,
  },
  { tahminUsd: (secilen.length * REKLAM_BASINA * 5.8) / 1000, sinirUsd: 1, zamanAsimiSn: 900 },
);
if (DENEME) {
  console.log(`\n${secilen.length} aday seçildi:`, secilen.slice(0, 10).map((i) => i.ad).join(", "), secilen.length > 10 ? "…" : "");
  process.exit(0);
}

/* Türkçe duyarlı sadeleştirme: küçük harf, aksan ve noktalama yok */
const sade = (s) =>
  String(s ?? "")
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (h) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[h])
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((k) => k.length > 2 && !["ve", "the", "cafe", "kafe", "restoran", "restaurant", "lokantasi", "ankara", "balikesir"].includes(k));
const ortusur = (sayfa, ad) => {
  const a = new Set(sade(ad));
  const s = sade(sayfa);
  if (a.size === 0 || s.length === 0) return false;
  const ortak = s.filter((k) => a.has(k)).length;
  return ortak / a.size >= 0.5;
};

/* Aktör her öğeye başlangıç adresini yazar; yazmazsa sayfa adından eşleştirilir */
const sorguAdi = (o) => {
  const u = o.url ?? o.inputUrl ?? o.startUrl ?? "";
  try {
    return new URL(u).searchParams.get("q");
  } catch {
    return null;
  }
};

const sonuc = { ...onceki };
const simdi = new Date().toISOString();
for (const i of secilen) {
  const ilgili = ogeler.filter((o) => sorguAdi(o) === i.ad || ortusur(o.pageName, i.ad));
  const eslesen = ilgili.filter((o) => ortusur(o.pageName, i.ad));
  const hedefler = eslesen.map((o) => alanAdi(o.snapshot?.linkUrl ?? o.snapshot?.cards?.[0]?.linkUrl ?? ""));
  sonuc[i.id] = {
    ad: i.ad,
    kontrol: simdi,
    aktifReklam: eslesen.length,
    sayfa: eslesen[0]?.pageName ?? null,
    hedefler: [...new Set(hedefler.filter(Boolean))],
    instagramaGidiyor: eslesen.some((o) => /instagram/i.test(o.snapshot?.ctaText ?? "") || hedefler.includes("instagram.com")),
    enEskiBaslangic: eslesen.map((o) => o.startDateFormatted).filter(Boolean).sort()[0] ?? null,
    belirsiz: ilgili.length - eslesen.length,
    kutuphane: kutuphane(i.ad),
  };
}

mkdirSync(VERI, { recursive: true });
writeFileSync(CIKTI, JSON.stringify(sonuc, null, 2));

const reklamVeren = secilen.filter((i) => sonuc[i.id].aktifReklam > 0);
console.log(`\n${bugun()}: ${secilen.length} aday kontrol edildi, ${reklamVeren.length} tanesi Meta'da reklam veriyor.`);
for (const i of reklamVeren) {
  const r = sonuc[i.id];
  console.log(`  ${i.ad} (${i.ilce ?? ""}) — ${r.aktifReklam} reklam${r.instagramaGidiyor ? ", Instagram'a gidiyor" : ""}${r.hedefler.length ? ` → ${r.hedefler.join(", ")}` : ""}`);
}
