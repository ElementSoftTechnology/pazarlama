/**
 * Apify istemcisi — bütün araçlar Apify'a YALNIZ buradan gider.
 *
 * Neden tek yer: harcama sınırı ve kayıt tek elden tutulsun. Ücretsiz plan
 * ayda 5 $; bir yanlış girdi (ör. sınırsız sonuç) bütün krediyi tek
 * çalıştırmada bitirebilir. Her çalıştırma:
 *   1. `maxTotalChargeUsd` ile Apify tarafında kesilir,
 *   2. sonucu ve tahmini maliyeti `veri/apify-kayit.jsonl` dosyasına yazar.
 *
 * `--deneme` bayrağıyla hiçbir istek atılmaz: girdi ve tahmini maliyet basılır.
 *
 * Kurallar: tek hesap (Apify koşulları §4.3). Apify'a yalnız kamuya açık
 * bilgi gider (kelime, rakip alan adı, işletme adı); müşteri ya da talep
 * verisi (ad, telefon) GÖNDERİLMEZ — KVKK, yurt dışı aktarım.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const KOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VERI = join(KOK, "veri");
export const DENEME = process.argv.includes("--deneme");

const GENEL_SINIR = Number(process.env.APIFY_CALISTIRMA_SINIRI_USD ?? 1.5);

export function bugun() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Aktörü çalıştırır, veri kümesindeki öğeleri döner.
 * @param aktor "kullanici/aktor-adi"
 * @param girdi aktörün girdi nesnesi
 * @param tahminUsd çalıştırmanın beklenen maliyeti (deneme çıktısı ve kayıt için)
 * @param sinirUsd bu çalıştırma için üst sınır (genel sınırı aşamaz)
 */
export async function calistir(aktor, girdi, { tahminUsd, sinirUsd = GENEL_SINIR, zamanAsimiSn = 300 } = {}) {
  const sinir = Math.min(sinirUsd, GENEL_SINIR);
  if (DENEME) {
    console.log(`\n[deneme] ${aktor}  tahmini ≈ ${tahminUsd?.toFixed(3) ?? "?"} $  (sınır ${sinir} $)`);
    console.log(JSON.stringify(girdi, null, 2).slice(0, 1500));
    return [];
  }
  const jeton = process.env.APIFY_TOKEN;
  if (!jeton) throw new Error("APIFY_TOKEN yok: .env.ornek dosyasını .env.local adıyla kopyalayıp doldurun.");

  const adres =
    `https://api.apify.com/v2/acts/${aktor.replace("/", "~")}/run-sync-get-dataset-items` +
    `?timeout=${zamanAsimiSn}&maxTotalChargeUsd=${sinir}&clean=true&format=json`;
  const bas = Date.now();
  const yanit = await fetch(adres, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${jeton}` },
    body: JSON.stringify(girdi),
    signal: AbortSignal.timeout((zamanAsimiSn + 30) * 1000),
  });
  const govde = await yanit.text();
  mkdirSync(VERI, { recursive: true });
  appendFileSync(
    join(VERI, "apify-kayit.jsonl"),
    JSON.stringify({ zaman: new Date().toISOString(), aktor, durum: yanit.status, sureSn: Math.round((Date.now() - bas) / 1000), tahminUsd, sinirUsd: sinir }) + "\n",
  );
  if (!yanit.ok) throw new Error(`${aktor}: HTTP ${yanit.status} ${govde.slice(0, 300)}`);
  return JSON.parse(govde);
}

/**
 * Uzun süren çalıştırma: `run-sync` uç noktası 300 sn'de keser, yüzlerce
 * aramalık iş için çalıştırma başlatılır, bitene kadar beklenir, veri kümesi
 * okunur. Kayda Apify'ın bildirdiği GERÇEK maliyet de yazılır (`gercekUsd`).
 */
export async function calistirUzun(aktor, girdi, { tahminUsd, sinirUsd = GENEL_SINIR, zamanAsimiSn = 1800 } = {}) {
  const sinir = Math.min(sinirUsd, GENEL_SINIR);
  if (DENEME) {
    console.log(`\n[deneme] ${aktor}  tahmini ≈ ${tahminUsd?.toFixed(3) ?? "?"} $  (sınır ${sinir} $)`);
    console.log(JSON.stringify(girdi, null, 2).slice(0, 1500));
    return [];
  }
  const jeton = process.env.APIFY_TOKEN;
  if (!jeton) throw new Error("APIFY_TOKEN yok: .env.ornek dosyasını .env.local adıyla kopyalayıp doldurun.");
  const baslik = { "content-type": "application/json", authorization: `Bearer ${jeton}` };
  const api = "https://api.apify.com/v2";

  const bas = Date.now();
  const baslat = await fetch(`${api}/acts/${aktor.replace("/", "~")}/runs?timeout=${zamanAsimiSn}&maxTotalChargeUsd=${sinir}`, {
    method: "POST",
    headers: baslik,
    body: JSON.stringify(girdi),
  });
  if (!baslat.ok) throw new Error(`${aktor}: HTTP ${baslat.status} ${(await baslat.text()).slice(0, 300)}`);
  let calisma = (await baslat.json()).data;
  console.log(`${aktor}: çalıştırma başladı (${calisma.id})`);

  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(calisma.status)) {
    await new Promise((r) => setTimeout(r, 15000));
    calisma = (await (await fetch(`${api}/actor-runs/${calisma.id}`, { headers: baslik })).json()).data;
  }
  const ogeler = await (await fetch(`${api}/datasets/${calisma.defaultDatasetId}/items?clean=true&format=json`, { headers: baslik })).json();

  mkdirSync(VERI, { recursive: true });
  appendFileSync(
    join(VERI, "apify-kayit.jsonl"),
    JSON.stringify({
      zaman: new Date().toISOString(),
      aktor,
      durum: calisma.status === "SUCCEEDED" ? 200 : 500,
      apifyDurum: calisma.status,
      sureSn: Math.round((Date.now() - bas) / 1000),
      tahminUsd: calisma.usageTotalUsd ?? tahminUsd,
      gercekUsd: calisma.usageTotalUsd ?? null,
      sinirUsd: sinir,
    }) + "\n",
  );
  console.log(`${aktor}: ${calisma.status}, ${ogeler.length} öğe, ≈ ${(calisma.usageTotalUsd ?? 0).toFixed(3)} $`);
  /* Sınıra takılıp kesilse de o ana kadarki sonuçlar kullanılır */
  return Array.isArray(ogeler) ? ogeler : [];
}

/** Alan adını sadeleştirir: https://www.ornek.com.tr/a → ornek.com.tr */
export function alanAdi(adres) {
  try {
    return new URL(adres).hostname.replace(/^www\./, "");
  } catch {
    return String(adres ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}
