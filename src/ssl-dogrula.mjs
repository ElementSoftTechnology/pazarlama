#!/usr/bin/env node
/**
 * npm run ssl-dogrula [-- --hepsi]
 *
 * "SSL yok" bulgusunu doğrular (2026-10-23). Aday taraması sitenin Haritalar'daki
 * http adresiyle açıldığını görüp "SSL yok" yazıyordu; ama sitelerin çoğu https ile
 * de açılıyor (ferdakocer.com). E-postada "https olmadan açılıyor" demek o zaman
 * yanıltıcı. Bu komut sitenin https:// adresine bağlanır:
 *   - geçerli sertifikayla açılıyorsa  → https: true  (bulgu metne girmez)
 *   - sertifika yok / geçersiz / bağlantı yok → https: false (bulgu yazılır)
 * Ölçülmeyen site için bulgu yazılmaz (ulasim.mjs → BULGULAR).
 *
 * Çıktı: veri/ssl-kontrol.json  { "<alan adı>": { https, neden, zaman } }
 * Daha önce ölçülen alan adı atlanır; --hepsi hepsini yeniden ölçer.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { KOK, VERI } from "./apify.mjs";

const ADAY = resolve(process.env.ADAY_KLASORU ?? join(KOK, "../aday"));
const DEFTER = join(ADAY, "cikti/_kayit/isletmeler.json");
const CIKTI = join(VERI, "ssl-kontrol.json");
const ZAMAN_ASIMI = 12000;
const ESZAMAN = 8;

const defter = JSON.parse(readFileSync(DEFTER, "utf8")).isletmeler;
const onceki = existsSync(CIKTI) && !process.argv.includes("--hepsi") ? JSON.parse(readFileSync(CIKTI, "utf8")) : {};

const alanAdi = (s) => {
  try {
    return new URL(s.sonAdres ?? s.adres).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const alanlar = [
  ...new Set(
    Object.values(defter)
      .map((i) => i.site)
      .filter((s) => s?.tur === "site" && s.acildi && (s.bulgular ?? []).some((b) => /^SSL yok/.test(b)))
      .map(alanAdi)
      .filter((a) => a && !onceki[a]),
  ),
];
console.log(`${alanlar.length} alan adının https'i ölçülecek.`);

/* AbortSignal.timeout süreci canlı tutmaz; canlı tutan yedek sınır (aday/site.mjs ile aynı ders) */
async function dene(alan) {
  let z;
  const yedek = new Promise((_, r) => (z = setTimeout(() => r(Object.assign(new Error("Zaman aşımı"), { name: "TimeoutError" })), ZAMAN_ASIMI + 3000)));
  try {
    const y = await Promise.race([
      fetch(`https://${alan}/`, { redirect: "follow", signal: AbortSignal.timeout(ZAMAN_ASIMI), headers: { "user-agent": "Mozilla/5.0" } }),
      yedek,
    ]);
    /* https isteği sonunda http'ye yönleniyorsa https çalışmıyor sayılır */
    if (y.url.startsWith("http:")) return { https: false, neden: "https, http'ye yönleniyor" };
    if (y.status >= 500) return { https: false, neden: `HTTP ${y.status}` };
    return { https: true, neden: `HTTP ${y.status}` };
  } catch (h) {
    const kod = h?.cause?.code ?? h?.name ?? "hata";
    return { https: false, neden: String(kod) };
  } finally {
    clearTimeout(z);
  }
}

const sonuc = { ...onceki };
let n = 0;
const kuyruk = [...alanlar];
await Promise.all(
  Array.from({ length: ESZAMAN }, async () => {
    while (kuyruk.length) {
      const a = kuyruk.shift();
      sonuc[a] = { ...(await dene(a)), zaman: new Date().toISOString() };
      if (++n % 100 === 0) console.log(`  … ${n}/${alanlar.length}`);
    }
  }),
);
writeFileSync(CIKTI, JSON.stringify(sonuc, null, 1));
const v = alanlar.map((a) => sonuc[a]);
console.log(`Bitti: https açılıyor ${v.filter((x) => x.https).length}, açılmıyor ${v.filter((x) => !x.https).length}. → ${CIKTI}`);
