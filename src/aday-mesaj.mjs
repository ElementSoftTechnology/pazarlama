#!/usr/bin/env node
/**
 * npm run aday-mesaj [-- --il Ankara|hepsi]
 *
 * Ulaşım listesini yazar: her sitesiz aday için gruba özel e-posta, WhatsApp
 * ve Instagram DM metni (ulasim.mjs). Apify'a hiçbir şey gitmez; ücretsiz.
 * `aday-eposta` bitince kendiliğinden çalışır; metin değişince elle çalıştırılır.
 *
 * İmzadaki ad `.env.local` → ULASIM_IMZA_AD (boşsa yalnız firma adı), WhatsApp numarası ULASIM_IMZA_NO.
 *
 * GÖNDERİM BU KOMUTTA YOK. Panel e-postayı posta programında, WhatsApp'ı
 * sohbette hazır açar; gönder düğmesine kullanıcı basar. Günde en çok 20-30
 * e-posta: alan adı yeni, SPF/DKIM kurulmadan toplu gönderim spam'e düşer.
 *
 * Çıktı: veri/aday-mesaj.json  { olusturma, imzaAd, isletmeler: [...] } (yorum sayısına göre)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { KOK, VERI } from "./apify.mjs";
import { gonderilebilir, guvenBul, hedefMi, kisaAd, metinler, siteEpostalari, whatsappBaglantisi, yenilemeHedefMi } from "./ulasim.mjs";

const ADAY = resolve(process.env.ADAY_KLASORU ?? join(KOK, "../aday"));
const DEFTER = join(ADAY, "cikti/_kayit/isletmeler.json");
const arg = (ad) => (process.argv.includes(ad) ? process.argv[process.argv.indexOf(ad) + 1] : undefined);
/* --il hepsi: bütün iller (Türkiye geneli taramalar, 2026-10-21) */
const IL = !arg("--il") || arg("--il") === "hepsi" ? null : arg("--il");
const IMZA = { ad: process.env.ULASIM_IMZA_AD?.trim() || null, whatsapp: process.env.ULASIM_IMZA_NO?.trim() || "0551 976 37 48" };

const oku = (yol, bos) => (existsSync(yol) ? JSON.parse(readFileSync(yol, "utf8")) : bos);
const defter = oku(DEFTER, { isletmeler: {} }).isletmeler;
const eposta = oku(join(VERI, "aday-eposta.json"), {});
/* Hibrit sıra (panel /ulasim/hibrit yazar): kullanıcının elle bulduğu Instagram hesabı ve e-posta */
const hibrit = oku(join(VERI, "hibrit.json"), {});
/* https ölçümü (npm run ssl-dogrula): SSL bulgusu yalnız ölçülmüşse metne girer */
const ssl = oku(join(VERI, "ssl-kontrol.json"), {});
const alanAdi = (s) => {
  try {
    return new URL(s.sonAdres ?? s.adres).hostname.toLowerCase();
  } catch {
    return null;
  }
};
for (const i of Object.values(defter)) if (i.site?.tur === "site") i.site.sslKontrol = ssl[alanAdi(i.site)] ?? null;
/* Gönderildi / cevap / ret işaretleri ayrı dosyada (veri/ulasim-durum.json): panel yazar, bu komut dokunmaz */

const isletmeler = Object.values(defter)
  /* İki kesim: sitesiz (hedefMi) ve sitesinde ölçülmüş sorun olan (yenilemeHedefMi; e-postası kendi sitesinden) */
  .filter((i) => (hedefMi(i) || yenilemeHedefMi(i)) && (!IL || i.il === IL))
  .sort((a, b) => (b.yorumSayisi ?? 0) - (a.yorumSayisi ?? 0))
  .map((i) => {
    const m = metinler(i, IMZA);
    /* Güven her seferinde güncel kuralla yeniden hesaplanır: kural sıkılaşınca eski kayıt da düzelir, para harcanmaz */
    const kayit = m.segment === "yenileme" ? { kontrol: i.sonKontrol ?? "site", adaylar: siteEpostalari(i) } : eposta[i.id];
    const h = hibrit[i.id] ?? {};
    const adaylar = (kayit?.adaylar ?? [])
      /* "info@www.alan.com" gibi sayfadan yanlış okunmuş adres düzeltilir */
      .map((a) => ({ ...a, eposta: a.eposta.replace(/@www./i, "@") }))
      .map((a) => (a.kaynak === "site" ? a : { ...a, guven: guvenBul(a.eposta, i.ad, a.kaynak) }));
    if (h.eposta && !adaylar.some((a) => a.eposta === h.eposta)) adaylar.unshift({ eposta: h.eposta, kaynak: "elle", guven: "yuksek", bag: null });
    const sira = { yuksek: 0, orta: 1, dusuk: 2 };
    const enIyi = [...adaylar].sort((a, b) => sira[a.guven] - sira[b.guven]).find((a) => gonderilebilir(a.guven)) ?? null;
    const e = kayit || h.eposta ? { ...kayit, adaylar, eposta: enIyi?.eposta ?? null, guven: enIyi?.guven ?? null, kaynak: enIyi?.kaynak ?? null } : null;
    if (e?.instagram?.kullanici === "popular") e.instagram = null;
    const telefonlar = (i.iletisim?.telefonlar ?? []).map((t) => t.numara);
    const cep = telefonlar.find((n) => whatsappBaglantisi(n, "")) ?? null;
    return {
      id: i.id,
      ad: i.ad,
      kategori: i.kategori,
      segment: m.segment,
      bulgu: m.bulgu,
      siteAdresi: m.segment === "yenileme" ? (i.site?.sonAdres ?? i.site?.adres ?? null) : null,
      grup: m.grup,
      grupAd: m.grupAd,
      ilce: i.ilce ?? null,
      mahalle: i.mahalle ?? null,
      puan: i.puan ?? null,
      yorumSayisi: i.yorumSayisi ?? 0,
      mapsLinki: i.mapsLinki ?? null,
      siteTuru: i.site?.tur ?? "yok",
      telefon: telefonlar[0] ?? null,
      cep,
      epostaKontrol: e?.kontrol ?? null,
      eposta: e?.eposta ?? null,
      guven: e?.guven ?? null,
      kaynak: e?.kaynak ?? null,
      dusukGuvenli: (e?.adaylar ?? []).filter((a) => a.guven === "dusuk").map((a) => ({ eposta: a.eposta, bag: a.bag })),
      instagram: e?.instagram?.kullanici ?? h.instagram ?? null,
      /* Hibrit sıralar için: Instagram'a Apify ile bakıldı mı, Google'da arandı mı, kullanıcı "yok" dedi mi */
      igBakildi: Boolean(e?.instagram?.bakildi),
      googleArandi: Boolean(kayit?.kontrol) && m.segment === "sitesiz",
      hibrit: { igYok: Boolean(h.igYok), epostaYok: Boolean(h.epostaYok) },
      il: i.il ?? null,
      kisa: kisaAd(i.ad),
      ornek: m.ornek,
      konu: m.eposta.konu,
      govde: m.eposta.govde,
      whatsapp: m.whatsapp,
      whatsappBaglantisi: cep ? whatsappBaglantisi(cep, m.whatsapp) : null,
      dm: m.dm,
    };
  });

/*
 * Gönderim engeli (2026-10-22 ilk deneme listesinden): küçük işletmeye değil kuruma ya da
 * zincirin merkezine giden adresler listeden çıkar, adres "engelliEposta"da durur.
 *  - kamu ve okul alan adları (gov, bel, k12, edu ...)
 *  - aynı kurumsal alan adı farklı adlı birden çok işletmede: zincir merkezi ya da rehber
 *    sitesi (izmirisrehberi.com.tr 11 işletmeye çıktı)
 *  - kurumsal kutular (kvkk@, musterihizmetleri@, merkezofis@ ...)
 */
const UCRETSIZ = /^(gmail|googlemail|hotmail|outlook|live|windowslive|msn|yahoo|ymail|icloud|me|yandex|mynet|mail|protonmail|aol)./i;
const KAMU = /.(gov|bel|k12|edu|pol|tsk|mil).tr$/i;
/* Platform adresi: işletmenin sitesi platform sayfasıysa oradan platformun kendi adresi okunuyor
   (2026-10-23 Çorbacı Erhan → info@yemeksepeti.com, otomatik yanıt döndü) */
const PLATFORM = /^(yemeksepeti|getir|trendyol|trendyolgo|tgoyemek|migros|hepsiburada|sahibinden|armut|wolt|n11|booking|tripadvisor|google|facebook|instagram|wix|godaddy|secureserver|hostinger|natro|turkcell|vodafone|turktelekom|ttnet)\.(com|com\.tr|net)$/i;
const KURUMSAL_KUTU = /^(kvkk|musterihizmetleri|merkezofis|genelmerkez|ik|insankaynaklari|hr|satinalma|bayi|bayilik|eticaret)@/i;
const adAnahtari = (ad) => ad.toLocaleLowerCase("tr").replace(/[^a-zçğıöşü0-9]+/g, " ").trim();
const alanAdlari = new Map();
for (const s of isletmeler) {
  if (!s.eposta) continue;
  const alan = s.eposta.split("@")[1].toLowerCase();
  if (UCRETSIZ.test(alan)) continue;
  if (!alanAdlari.has(alan)) alanAdlari.set(alan, new Set());
  alanAdlari.get(alan).add(adAnahtari(s.ad));
}
for (const s of isletmeler) {
  if (!s.eposta) continue;
  const alan = s.eposta.split("@")[1].toLowerCase();
  const neden = KAMU.test(alan)
    ? "kamu/okul adresi"
    : PLATFORM.test(alan)
      ? "platformun adresi"
      : (alanAdlari.get(alan)?.size ?? 0) > 1
      ? "aynı alan adı başka işletmelerde (zincir ya da rehber)"
      : KURUMSAL_KUTU.test(s.eposta)
        ? "kurumsal kutu"
        : null;
  if (neden) Object.assign(s, { engelliEposta: s.eposta, epostaEngel: neden, eposta: null, guven: null });
}

mkdirSync(VERI, { recursive: true });
writeFileSync(join(VERI, "aday-mesaj.json"), JSON.stringify({ olusturma: new Date().toISOString(), il: IL, imzaAd: IMZA.ad, isletmeler }, null, 2));

const say = (f) => isletmeler.filter(f).length;
console.log(
  `Ulaşım listesi: ${isletmeler.length} işletme (sitesiz ${say((s) => s.segment === "sitesiz")}, site yenileme ${say((s) => s.segment === "yenileme")}) · e-posta ${say((s) => s.eposta)} (engellenen ${say((s) => s.epostaEngel)}) · WhatsApp ${say((s) => s.cep)} · ` +
    `yenilemede e-posta ${say((s) => s.segment === "yenileme" && s.eposta)} · e-postası aranmamış ${say((s) => !s.epostaKontrol)}${IMZA.ad ? "" : " · imzada ad yok (ULASIM_IMZA_AD)"}`,
);
