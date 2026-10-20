#!/usr/bin/env node
/**
 * npm run aday-eposta [-- --adet 300] [--il Ankara] [--butce 1.9] [--deneme]
 *
 * Sitesiz adayların e-postasını arar (2026-10-20). Yorum sayısı en yüksekten
 * başlar; daha önce bakılan işletme bir daha aranmaz (para iki kez harcanmasın).
 *
 * Sıra (her adım yalnız öncekinde bulunamayanlar için):
 *  1. Ortak defter: Haritalar kaydında e-posta var mı (ücretsiz)
 *  2. Google araması, işletme başına TEK sorgu: "<ad>" <ilçe> Ankara iletişim
 *     Sonuç metinlerinde e-posta ve işletmenin Instagram hesabı aranır.
 *     apify/google-search-scraper ≈ 0,0045 $ / sorgu
 *  3. Instagram biyografisi: Haritalar'daki ya da 2. adımda bulunan hesap.
 *     apify/instagram-profile-scraper ≈ 0,0026 $ / profil
 *  Her adres işletme adıyla karşılaştırılır (ulasim.mjs → guvenBul). Adı
 *  tutmayan adres "dusuk" güvenle kaydedilir ama gönderim listesine girmez.
 *
 * Ücretsiz arama motorları birkaç sorgudan sonra otomatik isteği engelliyor
 * (2026-10-20 denemesi: DuckDuckGo 2. sorguda 202); engel aşılmaya çalışılmaz.
 *
 * Apify'a giden: işletme adı, ilçe ve Instagram kullanıcı adı (hepsi
 * Haritalar'da kamuya açık). Telefon ve kişi verisi gitmez.
 *
 * Çıktı: veri/aday-eposta.json  { "<aday id>": { kontrol, eposta, guven, kaynak, adaylar, instagram } }
 * Bitince `aday-mesaj` çalışır: metinler güncellenir.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { DENEME, KOK, VERI, calistirUzun } from "./apify.mjs";
import { epostalariBul, guvenBul, hedefMi, kisaAd, metneUyar, sade } from "./ulasim.mjs";

const ADAY = resolve(process.env.ADAY_KLASORU ?? join(KOK, "../aday"));
const DEFTER = join(ADAY, "cikti/_kayit/isletmeler.json");
const CIKTI = join(VERI, "aday-eposta.json");

const arg = (ad) => (process.argv.includes(ad) ? process.argv[process.argv.indexOf(ad) + 1] : undefined);
const ADET = Math.max(1, Math.min(1500, Number(arg("--adet")) || 300));
const IL = arg("--il") ?? "Ankara";
/* Toplam harcama üst sınırı; Google ve Instagram birlikte bunu aşmaz */
const BUTCE = Math.max(0.1, Math.min(2.2, Number(arg("--butce")) || 1.9));
const FIYAT = { google: 0.0045, instagram: 0.0026 };

if (!existsSync(DEFTER)) {
  console.error(`Aday defteri yok: ${DEFTER}`);
  process.exit(1);
}
const defter = JSON.parse(readFileSync(DEFTER, "utf8")).isletmeler;
const onceki = existsSync(CIKTI) ? JSON.parse(readFileSync(CIKTI, "utf8")) : {};

/* Google bütçesi: toplamın en çok %80'i; kalanı Instagram'a */
const googleAzami = Math.floor((BUTCE * 0.8) / FIYAT.google);
const secilen = Object.values(defter)
  .filter((i) => hedefMi(i) && (!IL || i.il === IL) && !onceki[i.id])
  .sort((a, b) => (b.yorumSayisi ?? 0) - (a.yorumSayisi ?? 0))
  .slice(0, ADET);
if (secilen.length === 0) {
  console.log("Aranacak aday yok (hepsine bakılmış).");
  process.exit(0);
}

const simdi = new Date().toISOString();
const sonuc = { ...onceki };
const kayit = (i, adaylar, instagram) => {
  /* En güvenilir adres seçilir; eşitse ilk bulunan */
  const sira = { yuksek: 0, orta: 1, dusuk: 2 };
  const enIyi = [...adaylar].sort((a, b) => sira[a.guven] - sira[b.guven])[0] ?? null;
  sonuc[i.id] = {
    ad: i.ad,
    kontrol: simdi,
    eposta: enIyi && enIyi.guven !== "dusuk" ? enIyi.eposta : null,
    guven: enIyi?.guven ?? null,
    kaynak: enIyi?.kaynak ?? null,
    adaylar,
    instagram: instagram ?? null,
  };
};
const ekle = (liste, eposta, i, kaynak, bag) => {
  if (liste.some((a) => a.eposta === eposta)) return;
  liste.push({ eposta, kaynak, guven: guvenBul(eposta, i.ad, kaynak), bag: bag ?? null });
};

/* ---- 1. Defter */
const bulunan = new Map(secilen.map((i) => [i.id, []]));
for (const i of secilen) for (const e of i.iletisim?.epostalar ?? []) ekle(bulunan.get(i.id), String(e.adres ?? e).toLowerCase(), i, "harita");

/* Haritalar'daki Instagram adresinden kullanıcı adı */
const kullaniciAdi = (adres) => {
  const m = String(adres ?? "").match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/);
  return m && !["p", "reel", "reels", "explore", "stories", "accounts", "tv", "share", "popular", "directory", "about", "legal"].includes(m[1].toLowerCase()) ? m[1].replace(/\.$/, "") : null;
};
const instagram = new Map();
for (const i of secilen) {
  const k = kullaniciAdi(i.iletisim?.sosyal?.instagram ?? (i.site?.tur === "sosyal" ? i.site.adres : null));
  if (k) instagram.set(i.id, { kullanici: k, kaynak: "harita" });
}

/* ---- 2. Google */
const googleIcin = secilen.filter((i) => bulunan.get(i.id).length === 0).slice(0, googleAzami);
const sorgu = (i) => `"${kisaAd(i.ad)}" ${i.ilce ?? ""} ${i.il ?? "Ankara"} iletişim`.replace(/\s+/g, " ").trim();
const sorgudan = new Map(googleIcin.map((i) => [sorgu(i), i]));
console.log(`${secilen.length} aday seçildi; ${googleIcin.length} tanesi Google'da aranacak (≈ ${(googleIcin.length * FIYAT.google).toFixed(2)} $).`);

const sayfalar = googleIcin.length
  ? await calistirUzun(
      "apify/google-search-scraper",
      {
        queries: [...sorgudan.keys()].join("\n"),
        resultsPerPage: 10,
        maxPagesPerQuery: 1,
        countryCode: "tr",
        languageCode: "tr",
        mobileResults: false,
        includeUnfilteredResults: false,
        saveHtml: false,
        saveHtmlToKeyValueStore: false,
      },
      {
        tahminUsd: googleIcin.length * FIYAT.google,
        sinirUsd: Math.max(0.5, Math.min(BUTCE * 0.8, googleIcin.length * FIYAT.google * 1.15)),
        zamanAsimiSn: 3000,
      },
    )
  : [];

for (const s of sayfalar) {
  const i = sorgudan.get(s.searchQuery?.term);
  if (!i) continue;
  for (const r of s.organicResults ?? []) {
    const metin = `${r.title ?? ""} ${r.description ?? ""}`;
    for (const e of epostalariBul(metin)) ekle(bulunan.get(i.id), e, i, "google", r.url);
    /* İşletmenin kendi Instagram hesabı: başlığında ya da kullanıcı adında işletme adı geçmeli */
    const k = kullaniciAdi(r.url);
    if (k && !instagram.has(i.id) && (metneUyar(r.title, i.ad) || sade(i.ad).some((w) => w.length >= 4 && k.toLowerCase().includes(w)))) {
      instagram.set(i.id, { kullanici: k, kaynak: "google" });
    }
  }
}

/* ---- 3. Instagram biyografisi */
const kalanButce = BUTCE - googleIcin.length * FIYAT.google;
const igIcin = secilen
  .filter((i) => instagram.has(i.id) && !bulunan.get(i.id).some((a) => a.guven !== "dusuk"))
  .slice(0, Math.max(0, Math.floor(kalanButce / FIYAT.instagram)));
console.log(`${igIcin.length} Instagram profiline bakılacak (≈ ${(igIcin.length * FIYAT.instagram).toFixed(2)} $).`);

const profiller = igIcin.length
  ? await calistirUzun(
      "apify/instagram-profile-scraper",
      { usernames: igIcin.map((i) => instagram.get(i.id).kullanici) },
      {
        tahminUsd: igIcin.length * FIYAT.instagram,
        sinirUsd: Math.max(0.05, Math.min(kalanButce, igIcin.length * FIYAT.instagram * 1.2)),
        zamanAsimiSn: 1800,
      },
    )
  : [];

const profilAdi = new Map(profiller.map((p) => [String(p.username ?? "").toLowerCase(), p]));
for (const i of igIcin) {
  const ig = instagram.get(i.id);
  const p = profilAdi.get(ig.kullanici.toLowerCase());
  if (!p) continue;
  ig.takipci = p.followersCount ?? null;
  ig.ad = p.fullName ?? null;
  const metin = [p.biography, p.businessEmail, p.publicEmail, p.email, p.externalUrl, ...(p.externalUrls ?? []).map((u) => u.url ?? u)].filter(Boolean).join(" ");
  for (const e of epostalariBul(metin)) ekle(bulunan.get(i.id), e, i, ig.kaynak === "harita" ? "instagram-harita" : "instagram", `https://instagram.com/${ig.kullanici}`);
}

if (DENEME) {
  console.log(`\n[deneme] ilk 10: ${secilen.slice(0, 10).map((i) => `${i.ad} (${i.yorumSayisi ?? 0})`).join(", ")}`);
  process.exit(0);
}

/* Google'a gidip sonucu gelmeyen işletme kaydedilmez: sonraki çalıştırmada yeniden denenir */
const googleSonucu = new Set(sayfalar.map((s) => s.searchQuery?.term));
for (const i of secilen) {
  const arandi = bulunan.get(i.id).length > 0 || googleSonucu.has(sorgu(i));
  if (arandi) kayit(i, bulunan.get(i.id), instagram.get(i.id));
}

mkdirSync(VERI, { recursive: true });
writeFileSync(CIKTI, JSON.stringify(sonuc, null, 2));

const bu = secilen.map((i) => sonuc[i.id]).filter((s) => s?.kontrol === simdi);
const gonderilir = bu.filter((s) => s.eposta);
console.log(
  `\n${bu.length} aday kaydedildi: ${gonderilir.length} e-posta (yüksek ${gonderilir.filter((s) => s.guven === "yuksek").length}, orta ${gonderilir.filter((s) => s.guven === "orta").length}), ` +
    `${bu.filter((s) => s.guven === "dusuk").length} adı tutmayan adres (gönderilmez), ${bu.filter((s) => s.instagram).length} Instagram hesabı.`,
);

/* Metinleri yenile */
await import("./aday-mesaj.mjs");
