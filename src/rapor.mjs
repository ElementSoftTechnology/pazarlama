#!/usr/bin/env node
/**
 * npm run rapor
 *
 * `veri/` altındaki son ölçümlerden haftalık özet yazar:
 * veri/rapor/<tarih>.md. Apify'a istek atmaz, ücretsizdir.
 *
 * Rapor bir başlangıçtır: Claude oturumunda "pazarlama raporunu yorumla"
 * denince bu dosya, Search Console, Ads ve Meta ekran görüntüleriyle birlikte
 * okunur ve bir sonraki haftanın tek kararı yazılır.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { VERI, bugun } from "./apify.mjs";

/** Klasördeki en yeni iki ölçüm (karşılaştırma için) */
function sonIki(klasor) {
  const yol = join(VERI, klasor);
  if (!existsSync(yol)) return [];
  return readdirSync(yol)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .slice(-2)
    .reverse()
    .map((f) => JSON.parse(readFileSync(join(yol, f), "utf8")));
}

const satirlar = [`# Pazarlama haftalık özet — ${bugun()}`, ""];

const [sira, onceki] = sonIki("sira");
if (sira) {
  const once = new Map((onceki?.olcum ?? []).map((o) => [o.kelime, o.sira]));
  const ilk30 = sira.olcum.filter((o) => o.sira !== null).length;
  satirlar.push(`## Google sırası (${sira.tarih}${onceki ? `, önceki ${onceki.tarih}` : ""})`, "", `${sira.olcum.length} kelimenin **${ilk30}** tanesinde ilk 30'dayız.`, "", "| Kelime | Sıra | Önceki | Çıkan sayfa | İlk üç |", "|---|---|---|---|---|");
  for (const o of sira.olcum) {
    satirlar.push(`| ${o.kelime} | ${o.sira ?? "—"} | ${once.get(o.kelime) ?? "—"} | ${o.cikanSayfa ?? ""} | ${o.ilkUc.join(", ")} |`);
  }
  satirlar.push("");
} else satirlar.push("## Google sırası", "", "Ölçüm yok: `npm run sira`.", "");

const [rg] = sonIki("rakip-google");
if (rg) {
  satirlar.push(`## Rakiplerin Google reklamları (${rg.tarih})`, "", "En uzun süre gösterilenler — metinleri kendi Ads başlıklarımızla karşılaştır.", "", "| Gün | Reklamveren | Biçim | Metin |", "|---|---|---|---|");
  for (const r of [...rg.reklamlar].sort((a, b) => (b.gun ?? 0) - (a.gun ?? 0)).slice(0, 12)) {
    satirlar.push(`| ${r.gun ?? "?"} | ${r.reklamveren ?? r.alanAdi ?? ""} | ${r.bicim ?? ""} | ${(r.metin ?? "").replace(/\|/g, "/").slice(0, 100)} |`);
  }
  satirlar.push("");
}

const [rm] = sonIki("rakip-meta");
if (rm) {
  satirlar.push(`## Meta'da açık benzer reklamlar (${rm.tarih})`, "", "Puan = açık kaldığı gün × varyasyon. Yüksek puanlı reklamın kancasını (ilk cümle) ve eylemini (DM, site, form) not al.", "", "| Gün | Varyasyon | Sayfa | Hedef | Eylem | Metin |", "|---|---|---|---|---|---|");
  for (const r of [...rm.reklamlar].sort((a, b) => (b.gundurAcik ?? 0) * b.varyasyon - (a.gundurAcik ?? 0) * a.varyasyon).slice(0, 12)) {
    satirlar.push(`| ${r.gundurAcik ?? "?"} | ${r.varyasyon} | ${r.sayfa ?? ""} | ${r.hedef} | ${r.eylem} | ${(r.metin ?? "").replace(/\s+/g, " ").replace(/\|/g, "/").slice(0, 90)} |`);
  }
  satirlar.push("");
}

const kayit = join(VERI, "apify-kayit.jsonl");
if (existsSync(kayit)) {
  const ay = bugun().slice(0, 7);
  const buAy = readFileSync(kayit, "utf8").trim().split("\n").map((s) => JSON.parse(s)).filter((k) => k.zaman.startsWith(ay));
  const toplam = buAy.reduce((t, k) => t + (k.tahminUsd ?? 0), 0);
  satirlar.push("## Apify harcaması", "", `Bu ay ${buAy.length} çalıştırma, tahmini **${toplam.toFixed(2)} $** / 5 $ ücretsiz kredi. Kesin rakam: Apify Console → Billing.`, "");
}

satirlar.push("## Elle eklenecekler", "", "- Search Console: son 7 gün tıklama, gösterim, ilk 10 sorgu", "- Google Ads: harcama, tıklama, Talep formu dönüşümü, arama terimleri", "- Meta reklam: harcama, sonuç (konuşma / tıklama), sonuç başına maliyet", "- Gelen talep e-postaları: sayı ve \"nereden geldi\" satırları", "");

mkdirSync(join(VERI, "rapor"), { recursive: true });
const dosya = join(VERI, "rapor", `${bugun()}.md`);
writeFileSync(dosya, satirlar.join("\n"));
console.log(`Rapor: ${dosya}`);
