#!/usr/bin/env node
/**
 * npm run aday-eposta [-- --adet 300] [--il Ankara|hepsi] [--butce 1.9] [--deneme] [--instagram-tekrar]
 *
 * Sitesiz adayların e-postasını arar (2026-10-20). Yorum sayısı en yüksekten
 * başlar; daha önce bakılan işletme bir daha aranmaz (para iki kez harcanmasın).
 *
 * Sıra (her adım yalnız öncekinde bulunamayanlar için):
 *  1. Ortak defter: Haritalar kaydında e-posta var mı (ücretsiz)
 *  2. Google araması, işletme başına TEK sorgu: "<ad>" <ilçe> Ankara iletişim
 *     Sonuç metinlerinde e-posta ve işletmenin Instagram hesabı aranır.
 *     apify/google-search-scraper ≈ 0,0045 $ / sorgu
 *  3. Instagram iletişim düğmesi + biyografi: Haritalar'daki ya da 2. adımda
 *     bulunan hesap. seemuapps/instagram-contact-scraper ≈ 0,0065 $ / profil.
 *     İşletme hesabının "E-posta" düğmesindeki adres (igPublicEmail) okunur:
 *     sitesiz esnafın e-postası en çok burada. 2026-10-20 ölçümü: dönen 8
 *     profilin 6'sında adres vardı; Google adımında 360 işletmede 6 adres.
 *     (apify/instagram-profile-scraper bu düğmeyi döndürmüyor; memo23 aktörü
 *     ücretsiz hesapta çalıştırma başına 3 profille sınırlı.)
 *
 * --google-calisma <id>: yerel süreç ölmüşse aynı seçimle var olan Google
 * çalıştırmasının sonucu okunur (yeniden ücretlenmez).
 *
 * --instagram-tekrar: daha önce aranmış, Instagram hesabı bulunmuş ama
 * gönderilebilir adresi olmayan işletmelere yalnız 3. adım uygulanır.
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
/* --il hepsi: bütün Türkiye (defterdeki her il) */
const IL = !arg("--il") || arg("--il") === "hepsi" ? null : arg("--il");
const TEKRAR = process.argv.includes("--instagram-tekrar");
/* Toplam harcama üst sınırı; Google ve Instagram birlikte bunu aşmaz */
const BUTCE = Math.max(0.1, Math.min(2.2, Number(arg("--butce")) || 1.9));
/*
 * Instagram iletişim aktörü (--aktor): ücretsiz hesapta seemuapps çalıştırma başına
 * 5 profil, günde 3; zaver kısıt yok ama profil 0,004 $ + bulunan iletişim 0,01 $.
 */
const AKTORLER = {
  seemuapps: { ad: "seemuapps/instagram-contact-scraper", fiyat: 0.0065, girdi: (u) => ({ usernames: u, scrapeLinkInBio: false }) },
  zaver: { ad: "zaver.api/instagram-email-contact-extractor", fiyat: 0.0115, girdi: (u) => ({ usernames: u, onlyWithContact: false }) },
};
const AKTOR = AKTORLER[arg("--aktor")] ?? AKTORLER.seemuapps;
const FIYAT = { google: 0.0045, instagram: AKTOR.fiyat };

if (!existsSync(DEFTER)) {
  console.error(`Aday defteri yok: ${DEFTER}`);
  process.exit(1);
}
const defter = JSON.parse(readFileSync(DEFTER, "utf8")).isletmeler;
const onceki = existsSync(CIKTI) ? JSON.parse(readFileSync(CIKTI, "utf8")) : {};
/* Hibrit sıra: kullanıcının panelde bulduğu Instagram hesapları da tekrar kipine girer */
const HIBRIT = join(VERI, "hibrit.json");
const hibrit = existsSync(HIBRIT) ? JSON.parse(readFileSync(HIBRIT, "utf8")) : {};
for (const [id, h] of Object.entries(hibrit)) {
  if (!h.instagram || h.eposta) continue;
  const k = onceki[id] ?? { ad: defter[id]?.ad, kontrol: null, eposta: null, adaylar: [], instagram: null };
  if (!k.instagram?.kullanici) k.instagram = { kullanici: h.instagram, kaynak: "elle" };
  onceki[id] = k;
}

/* Google bütçesi: toplamın en çok %80'i; kalanı Instagram'a */
const googleAzami = TEKRAR ? 0 : Math.floor((BUTCE * 0.8) / FIYAT.google);
const SAHTE = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "tv", "share", "popular", "directory", "about", "legal"]);
const tekrarlik = (k) => k?.instagram?.kullanici && !SAHTE.has(k.instagram.kullanici.toLowerCase()) && !k.instagram.bakildi && !k.eposta;
const secilen = Object.values(defter)
  .filter((i) => hedefMi(i) && (!IL || i.il === IL) && (TEKRAR ? tekrarlik(onceki[i.id]) : !onceki[i.id]))
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
/* Tekrarda önceki adaylar korunur (dusuk olanlar elle bakılmak için durur) */
const bulunan = new Map(secilen.map((i) => [i.id, TEKRAR ? [...(onceki[i.id].adaylar ?? [])] : []]));
for (const i of secilen) for (const e of i.iletisim?.epostalar ?? []) ekle(bulunan.get(i.id), String(e.adres ?? e).toLowerCase(), i, "harita");

/* Haritalar'daki Instagram adresinden kullanıcı adı */
const kullaniciAdi = (adres) => {
  const m = String(adres ?? "").match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/);
  return m && !SAHTE.has(m[1].toLowerCase()) ? m[1].replace(/\.$/, "") : null;
};
const instagram = new Map();
for (const i of secilen) {
  const k = kullaniciAdi(i.iletisim?.sosyal?.instagram ?? (i.site?.tur === "sosyal" ? i.site.adres : null));
  if (k) instagram.set(i.id, { kullanici: k, kaynak: "harita" });
  if (TEKRAR) instagram.set(i.id, { ...onceki[i.id].instagram });
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
        devamId: arg("--google-calisma"),
      },
    )
  : [];
if (sayfalar.length) writeFileSync(join(VERI, `google-ham-${simdi.replace(/[:.]/g, "-")}.json`), JSON.stringify(sayfalar));

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
      AKTOR.ad,
      AKTOR.girdi(igIcin.map((i) => instagram.get(i.id).kullanici)),
      {
        tahminUsd: igIcin.length * FIYAT.instagram,
        sinirUsd: Math.max(0.05, Math.min(kalanButce, igIcin.length * FIYAT.instagram * 1.2)),
        zamanAsimiSn: 1800,
      },
    )
  : [];

/* Ham çıktı saklanır: alan adları değişirse para yeniden harcanmadan tekrar okunur */
if (profiller.length) writeFileSync(join(VERI, `instagram-ham-${simdi.replace(/[:.]/g, "-")}.json`), JSON.stringify(profiller, null, 1));
const profilAdi = new Map(profiller.map((p) => [String(p.username ?? p.inputUsername ?? p.input ?? "").replace(/^@/, "").toLowerCase(), p]));
for (const i of igIcin) {
  const ig = instagram.get(i.id);
  const p = profilAdi.get(ig.kullanici.toLowerCase());
  if (!p) continue;
  ig.bakildi = simdi;
  ig.dis = p.externalUrl ?? null;
  const bag = `https://instagram.com/${ig.kullanici}`;
  /* İletişim düğmesi: adresi hesabın sahibi yazmış; hesap Haritalar'dan geldiyse kesin */
  for (const e of epostalariBul([p.igPublicEmail, p.publicEmail, p.public_email, p.businessEmail, p.business_email].filter(Boolean).join(" ")))
    ekle(bulunan.get(i.id), e, i, /* Hesap Haritalar'dan ya da kullanıcının elle doğrulamasından geldiyse kesin */
      ig.kaynak === "harita" || ig.kaynak === "elle" ? "instagram-dugme-harita" : "instagram-dugme", bag);
  const metin = [p.biography, p.bio, p.email, ...(Array.isArray(p.emails) ? p.emails : []).map((x) => x?.email ?? x)].filter(Boolean).join(" ");
  for (const e of epostalariBul(metin)) ekle(bulunan.get(i.id), e, i, ig.kaynak === "harita" ? "instagram-harita" : "instagram", `https://instagram.com/${ig.kullanici}`);
}

if (DENEME) {
  console.log(`\n[deneme] ilk 10: ${secilen.slice(0, 10).map((i) => `${i.ad} (${i.yorumSayisi ?? 0})`).join(", ")}`);
  process.exit(0);
}

/* Google'a gidip sonucu gelmeyen işletme kaydedilmez: sonraki çalıştırmada yeniden denenir */
const googleSonucu = new Set(sayfalar.map((s) => s.searchQuery?.term));
for (const i of secilen) {
  const arandi = TEKRAR ? Boolean(instagram.get(i.id)?.bakildi) : bulunan.get(i.id).length > 0 || googleSonucu.has(sorgu(i));
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
