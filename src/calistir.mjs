#!/usr/bin/env node
/**
 * node src/calistir.mjs <komut> [ek argümanlar]
 *
 * Panelin ölçüm başlatma kapısı. Komutu alt süreçte çalıştırır ve durumunu
 * `veri/calisma.json` dosyasına yazar; panel bu dosyayı okuyarak "çalışıyor /
 * bitti / hata" gösterir. Çıktı `veri/calisma-<komut>.log` dosyasına gider.
 *
 * Aynı anda tek ölçüm: çalışan varken ikincisi başlamaz (Apify kredisi iki
 * kez harcanmasın).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { KOK, VERI } from "./apify.mjs";

export const KOMUTLAR = ["sira", "rakip-google", "rakip-meta", "aday-reklam", "aday-eposta", "aday-mesaj", "rapor"];
const DURUM = join(VERI, "calisma.json");

const [komut, ...ek] = process.argv.slice(2);
if (!KOMUTLAR.includes(komut)) {
  console.error(`Bilinmeyen komut: ${komut}. Geçerli: ${KOMUTLAR.join(", ")}`);
  process.exit(1);
}

mkdirSync(VERI, { recursive: true });
if (existsSync(DURUM)) {
  const d = JSON.parse(readFileSync(DURUM, "utf8"));
  /* 30 dakikadan eski "çalışıyor" kaydı yarım kalmış sayılır */
  if (d.durum === "calisiyor" && Date.now() - Date.parse(d.baslangic) < 30 * 60000) {
    console.error(`Zaten çalışan bir ölçüm var: ${d.komut}`);
    process.exit(2);
  }
}

const yaz = (d) => writeFileSync(DURUM, JSON.stringify(d, null, 2));
const baslangic = new Date().toISOString();
yaz({ komut, durum: "calisiyor", baslangic, bitis: null, cikisKodu: null });

const gunluk = openSync(join(VERI, `calisma-${komut}.log`), "w");
const cocuk = spawn(process.execPath, ["--env-file-if-exists=.env.local", join("src", `${komut}.mjs`), ...ek], {
  cwd: KOK,
  stdio: ["ignore", gunluk, gunluk],
  windowsHide: true,
});
cocuk.on("exit", (kod) => {
  yaz({ komut, durum: kod === 0 ? "bitti" : "hata", baslangic, bitis: new Date().toISOString(), cikisKodu: kod });
});
