#!/usr/bin/env node
/**
 * npm run aday-mesaj [-- --il Ankara]
 *
 * Ulaşım listesini yazar: her sitesiz aday için gruba özel e-posta, WhatsApp
 * ve Instagram DM metni (ulasim.mjs). Apify'a hiçbir şey gitmez; ücretsiz.
 * `aday-eposta` bitince kendiliğinden çalışır; metin değişince elle çalıştırılır.
 *
 * İmzadaki ad `.env.local` → ULASIM_IMZA_AD (boşsa yalnız firma adı).
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
import { gonderilebilir, guvenBul, hedefMi, metinler, whatsappBaglantisi } from "./ulasim.mjs";

const ADAY = resolve(process.env.ADAY_KLASORU ?? join(KOK, "../aday"));
const DEFTER = join(ADAY, "cikti/_kayit/isletmeler.json");
const arg = (ad) => (process.argv.includes(ad) ? process.argv[process.argv.indexOf(ad) + 1] : undefined);
const IL = arg("--il") ?? "Ankara";
const IMZA = { ad: process.env.ULASIM_IMZA_AD?.trim() || null, whatsapp: "0551 976 37 48" };

const oku = (yol, bos) => (existsSync(yol) ? JSON.parse(readFileSync(yol, "utf8")) : bos);
const defter = oku(DEFTER, { isletmeler: {} }).isletmeler;
const eposta = oku(join(VERI, "aday-eposta.json"), {});
/* Gönderildi / cevap / ret işaretleri ayrı dosyada (veri/ulasim-durum.json): panel yazar, bu komut dokunmaz */

const isletmeler = Object.values(defter)
  .filter((i) => hedefMi(i) && (!IL || i.il === IL))
  .sort((a, b) => (b.yorumSayisi ?? 0) - (a.yorumSayisi ?? 0))
  .map((i) => {
    const m = metinler(i, IMZA);
    /* Güven her seferinde güncel kuralla yeniden hesaplanır: kural sıkılaşınca eski kayıt da düzelir, para harcanmaz */
    const kayit = eposta[i.id];
    const adaylar = (kayit?.adaylar ?? []).map((a) => ({ ...a, guven: guvenBul(a.eposta, i.ad, a.kaynak) }));
    const sira = { yuksek: 0, orta: 1, dusuk: 2 };
    const enIyi = [...adaylar].sort((a, b) => sira[a.guven] - sira[b.guven]).find((a) => gonderilebilir(a.guven)) ?? null;
    const e = kayit ? { ...kayit, adaylar, eposta: enIyi?.eposta ?? null, guven: enIyi?.guven ?? null, kaynak: enIyi?.kaynak ?? null } : null;
    if (e?.instagram?.kullanici === "popular") e.instagram = null;
    const telefonlar = (i.iletisim?.telefonlar ?? []).map((t) => t.numara);
    const cep = telefonlar.find((n) => whatsappBaglantisi(n, "")) ?? null;
    return {
      id: i.id,
      ad: i.ad,
      kategori: i.kategori,
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
      instagram: e?.instagram?.kullanici ?? null,
      ornek: m.ornek,
      konu: m.eposta.konu,
      govde: m.eposta.govde,
      whatsapp: m.whatsapp,
      whatsappBaglantisi: cep ? whatsappBaglantisi(cep, m.whatsapp) : null,
      dm: m.dm,
    };
  });

mkdirSync(VERI, { recursive: true });
writeFileSync(join(VERI, "aday-mesaj.json"), JSON.stringify({ olusturma: new Date().toISOString(), il: IL, imzaAd: IMZA.ad, isletmeler }, null, 2));

const say = (f) => isletmeler.filter(f).length;
console.log(
  `Ulaşım listesi: ${isletmeler.length} işletme · e-posta ${say((s) => s.eposta)} · WhatsApp ${say((s) => s.cep)} · ` +
    `e-postası aranmamış ${say((s) => !s.epostaKontrol)}${IMZA.ad ? "" : " · imzada ad yok (ULASIM_IMZA_AD)"}`,
);
