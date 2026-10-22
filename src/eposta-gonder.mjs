#!/usr/bin/env node
/**
 * npm run eposta-gonder [-- --adet 10] [--kesim sitesiz|yenileme] [--gonder]
 *
 * Ulaşım listesindeki (veri/aday-mesaj.json) e-postaları iletisim@ hesabından
 * Gmail SMTP ile gönderir (2026-10-20). Şifre Google hesabının 16 haneli
 * UYGULAMA ŞİFRESİ: .env.local → SMTP_UYGULAMA_SIFRESI. Depoya girmez.
 *
 * --gonder YOKSA HİÇBİR ŞEY GİTMEZ: kime ne gideceği listelenir (deneme).
 *
 * Kurallar:
 *  - Günde en çok GUNLUK_SINIR (150; kullanıcı kararı 2026-10-22) e-posta; panelden elle
 *    işaretlenenler de sayılır. Gmail sınır ya da spam hatası verirse gönderim durur.
 *    Alan adı soğuk gönderime yeni: birden fazla yüz e-posta spam'e düşürür.
 *  - Gönderimler arası 45-90 sn rastgele bekleme.
 *  - Durumu olan (gönderildi / cevap / ret) işletmeye bir daha yazılmaz.
 *  - Yalnız "yuksek" ve "orta" güvenli adres (aday-mesaj zaten öyle seçer).
 *  - Her e-postada ret satırı ("hayır" yazmanız yeterli) ve List-Unsubscribe başlığı.
 *  - Göndermeden önce SPF / DKIM / DMARC DNS'te aranır; biri yoksa durur.
 *
 * Her gönderim veri/ulasim-durum.json'a "gonderildi" diye yazılır (panel
 * aynı dosyayı okur) ve veri/eposta-gunluk.jsonl'e eklenir.
 */
import { randomInt } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as bekle } from "node:timers/promises";

import nodemailer from "nodemailer";

import { VERI } from "./apify.mjs";

const GUNLUK_SINIR = 150;
const GONDEREN = process.env.SMTP_KULLANICI?.trim() || "iletisim@elementsoftechnology.com";
const ALAN = GONDEREN.split("@")[1];

const arg = (ad) => (process.argv.includes(ad) ? process.argv[process.argv.indexOf(ad) + 1] : undefined);
const GONDER = process.argv.includes("--gonder");
const KESIM = ["sitesiz", "yenileme"].includes(arg("--kesim")) ? arg("--kesim") : null;

const LISTE = join(VERI, "aday-mesaj.json");
const DURUM = join(VERI, "ulasim-durum.json");
const GUNLUK = join(VERI, "eposta-gunluk.jsonl");
const oku = (yol, bos) => (existsSync(yol) ? JSON.parse(readFileSync(yol, "utf8")) : bos);

if (!existsSync(LISTE)) {
  console.error("Ulaşım listesi yok: önce `npm run aday-mesaj`.");
  process.exit(1);
}
const liste = oku(LISTE, null);
const durumlar = oku(DURUM, {});

/* Bugün (Türkiye saatiyle) gönderilenler: panelden elle işaretlenenler dahil */
const gun = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const bugun = gun(Date.now());
const bugunGiden = Object.values(durumlar).filter((d) => d.durum === "gonderildi" && d.kanal === "eposta" && gun(d.zaman) === bugun).length;
const hak = Math.max(0, GUNLUK_SINIR - bugunGiden);
const ADET = Math.min(hak, Math.max(1, Number(arg("--adet")) || hak));

/* Aynı adrese iki işletme adına yazılmasın (zincir şubeleri tek adres kullanıyor) */
const yazilanAdres = new Set(
  Object.entries(durumlar)
    .map(([id]) => liste.isletmeler.find((s) => s.id === id)?.eposta)
    .filter(Boolean),
);
const sira = [];
for (const s of liste.isletmeler) {
  if (!s.eposta || durumlar[s.id] || (KESIM && (s.segment ?? "sitesiz") !== KESIM) || yazilanAdres.has(s.eposta)) continue;
  yazilanAdres.add(s.eposta);
  sira.push(s);
  if (sira.length >= ADET) break;
}

console.log(`Bugün gönderilen: ${bugunGiden}/${GUNLUK_SINIR}. Bu çalıştırmada: ${sira.length}${KESIM ? ` (${KESIM})` : ""}.`);
if (!liste.imzaAd) console.log("Not: imzada ad yok (ULASIM_IMZA_AD); yalnız firma adıyla gider.");
for (const s of sira) console.log(`  ${s.segment === "yenileme" ? "[yenileme]" : "[sitesiz] "} ${s.ad} → ${s.eposta} (${s.guven}) · ${s.konu}`);

if (!GONDER) {
  console.log("\nDeneme: hiçbir şey gönderilmedi. Göndermek için: npm run eposta-gonder -- --gonder");
  process.exit(0);
}
if (sira.length === 0) process.exit(0);

const SIFRE = process.env.SMTP_UYGULAMA_SIFRESI?.replace(/\s+/g, "");
if (!SIFRE || SIFRE.length !== 16) {
  console.error("SMTP_UYGULAMA_SIFRESI yok ya da 16 hane değil (.env.local). Google hesabı → Güvenlik → Uygulama şifreleri.");
  process.exit(1);
}

/* Kimlik doğrulama kayıtları: biri yoksa Gmail ve Outlook soğuk e-postayı reddeder */
const txt = async (ad) => (await resolveTxt(ad).catch(() => [])).map((p) => p.join(""));
const [kok, dmarc, dkim] = await Promise.all([txt(ALAN), txt(`_dmarc.${ALAN}`), txt(`google._domainkey.${ALAN}`)]);
const eksik = [
  !kok.some((t) => t.startsWith("v=spf1") && t.includes("_spf.google.com")) && "SPF",
  !dkim.some((t) => t.startsWith("v=DKIM1")) && "DKIM",
  !dmarc.some((t) => t.startsWith("v=DMARC1")) && "DMARC",
].filter(Boolean);
if (eksik.length) {
  console.error(`DNS'te eksik: ${eksik.join(", ")}. Gönderim durduruldu.`);
  process.exit(1);
}

const posta = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: GONDEREN, pass: SIFRE } });
await posta.verify();

const durumYaz = (id) => {
  const d = oku(DURUM, {});
  d[id] = { durum: "gonderildi", zaman: new Date().toISOString(), kanal: "eposta" };
  const gecici = `${DURUM}.${process.pid}.tmp`;
  writeFileSync(gecici, JSON.stringify(d, null, 2));
  renameSync(gecici, DURUM);
};

let giden = 0;
for (const [n, s] of sira.entries()) {
  try {
    const bilgi = await posta.sendMail({
      from: { name: "Elements of Technology", address: GONDEREN },
      to: s.eposta,
      subject: s.konu,
      text: s.govde,
      headers: { "List-Unsubscribe": `<mailto:${GONDEREN}?subject=hayir>` },
    });
    durumYaz(s.id);
    appendFileSync(GUNLUK, `${JSON.stringify({ zaman: new Date().toISOString(), id: s.id, ad: s.ad, eposta: s.eposta, kesim: s.segment, kimlik: bilgi.messageId })}\n`);
    giden++;
    console.log(`✓ ${s.ad} → ${s.eposta}`);
  } catch (h) {
    /* Hata olanı işaretleme: sonraki çalıştırmada yeniden denenir. Kimlik hatasında hepsi aynı hatayı verir: dur */
    console.error(`✗ ${s.ad} → ${s.eposta}: ${h.message}`);
    if (/auth|535|534/i.test(String(h.message))) break;
    /* Gmail gönderim sınırı / geçici engel / spam şüphesi: devam etmek hesabı riske atar */
    if (/(421|450|451|452|454|550 5.4.5|550 5.7.1)|rate limit|limit exceeded|too many|unsolicited|spam/i.test(String(h.message))) {
      console.error("Gmail gönderimi kısıtladı; bugünlük durduruldu. Yarın yeniden çalıştırın, hata sürerse sınırı düşürün.");
      break;
    }
  }
  if (n < sira.length - 1) await bekle(randomInt(45, 91) * 1000);
}
posta.close();
console.log(`\n${giden} e-posta gönderildi. Bugün toplam: ${bugunGiden + giden}/${GUNLUK_SINIR}.`);
