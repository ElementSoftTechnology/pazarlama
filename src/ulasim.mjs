/**
 * Ulaşım listesi — sitesiz adaylara e-posta / WhatsApp / DM (2026-10-20).
 *
 * Tek yer: hedef seçimi, kategori grupları ve gruba özel metinler. `aday-eposta`
 * (e-posta arar) ve `aday-mesaj` (metinleri yazar) buradan okur; panel yalnız
 * `veri/aday-mesaj.json` dosyasını gösterir.
 *
 * Metin kuralları (el-kitabi CLAUDE.md 1-3, 10-satis/is-akislari/03):
 *  - "Sizin için site hazırladık" YAZILMAZ: site yalnız dönenlere yapılır.
 *    Mailde sektörün katalog örneği gösterilir, işletmeye özel olanı teklif edilir.
 *  - Fiyat yok, "Google'da birinci sıra" yok, kazanç vaadi yok.
 *  - Haritalar'daki puan/yorum kaynaklıdır (tarama tarihi); başka bilgi uydurulmaz.
 *  - Kimlik + kolay ret satırı her metinde (6563 s. Kanun, esnaf/tacir istisnası
 *    m.6/2; ret hakkı m.8). Hukuki görüş değildir.
 *  - İşletme adına ek getirilmez ("X'in" gibi): yanlış ünlü uyumu kişisel
 *    olmayan, şablon gibi görünür. Ad yalnız "X için" kalıbında geçer.
 */

export const KATALOG = "https://katalog.elementsoftechnology.com";
export const SITE = "https://elementsoftechnology.com";

/** Bu kategoriler aranmaz: kamu, cadde/park, reklam kuralları ağır meslekler */
const DISARIDA =
  /(^|s)park($|s)|otopark|lunapark|cami|mescit|atm|banka|belediye|kaymakaml|müdürlü|karakol|hastane|devlet|üniversite|ilkokul|ortaokul|lise\b|durak|istasyon|anıt|müze|kütüphane|meydan|metro|eczane|noter|siyasi|parti|dernek|vakf|vakıf|sendika|mezarl|ibadet|kilise|bakanl|elçili|konsolos|erotik|tekel|alkollü|sağlık ocağı|aile sağlığı|muayene istasyon/i;

/* Kalıplar küçük harfe çevrilmiş adla denenir: /i bayrağı "İ" harfini "i" saymaz */
const kucuk = (s) => String(s ?? "").toLocaleLowerCase("tr");

/*
 * Gruplar sırayla denenir; ilk eşleşen alınır (diş, sağlıktan önce; oto,
 * ustadan önce: "Oto Tamirhanesi" oto grubuna düşsün).
 * `ornek`: katalogdaki en yakın demo. Yakın demo yoksa tasarımlar sayfası.
 */
export const GRUPLAR = [
  {
    kod: "dis",
    ad: "Diş kliniği",
    desen: /diş|ağız|ortodont|implant/i,
    ornek: { ad: "diş klinikleri için hazırladığımız örnek", url: `${KATALOG}/kurumsal/klinik/` },
    fayda: "Tedavileriniz, hekim bilgileri, konumunuz ve randevu için tek dokunuşla arama ya da WhatsApp düğmesi tek bir sayfada durur.",
  },
  {
    kod: "veteriner",
    ad: "Veteriner",
    desen: /veteriner|pet ?shop|evcil|hayvan/i,
    ornek: { ad: "klinikler için hazırladığımız örnek", url: `${KATALOG}/kurumsal/klinik/` },
    fayda: "Hizmetleriniz, çalışma saatleriniz, konumunuz ve tek dokunuşla arama düğmesi tek bir sayfada durur.",
  },
  {
    kod: "saglik",
    ad: "Sağlık",
    desen: /klinik|doktor|hekim|tıp|fizik|psikolo|diyetisyen|sağlık|laboratuvar|poliklinik|estetik|optik|işitme|terapi/i,
    ornek: { ad: "klinikler için hazırladığımız örnek", url: `${KATALOG}/kurumsal/klinik/` },
    fayda: "Hizmetleriniz, uzman bilgileri, konumunuz ve randevu düğmesi tek bir sayfada durur.",
  },
  {
    kod: "guzellik",
    ad: "Güzellik ve kuaför",
    desen: /güzellik|kuaför|berber|epilasyon|tırnak|cilt|spa\b|masaj|makyaj|saç|kaş|lazer/i,
    ornek: { ad: "randevulu işletmeler için hazırladığımız örnek", url: `${KATALOG}/vitrin/studyo/` },
    fayda: "Hizmet listeniz, çalışmalarınızdan fotoğraflar ve WhatsApp'tan randevu düğmesi tek bir sayfada durur.",
  },
  {
    kod: "spor",
    ad: "Spor ve stüdyo",
    desen: /pilates|spor|fitness|yoga|dans|dövüş|yüzme|boks|tenis|jimnastik/i,
    ornek: { ad: "stüdyolar için hazırladığımız örnek", url: `${KATALOG}/vitrin/studyo/` },
    fayda: "Ders programınız, eğitmenleriniz ve deneme dersi için WhatsApp düğmesi tek bir sayfada durur.",
  },
  {
    kod: "yemek",
    ad: "Restoran ve lokanta",
    desen: /restoran|lokanta|kebap|döner|köfte|pide|lahmacun|balık|et lokanta|mangal|ocakbaşı|yemek|burger|pizza|mantı|işkembe|kahvaltı|çorba|dürüm|tantuni|kokoreç|büfe|meyhane/i,
    ornek: { ad: "lokantalar için hazırladığımız örnek", url: `${KATALOG}/vitrin/lokanta/` },
    fayda: "Menünüz, çalışma saatleriniz, konumunuz ve arama düğmesi tek bir sayfada durur; isterseniz masalara QR menü de eklenir.",
  },
  {
    kod: "kafe",
    ad: "Kafe, fırın, pastane",
    desen: /kafe|cafe|kahve|pastane|fırın|tatlı|dondurma|börek|simit|çay|baklava|unlu|çikolata|şekerleme/i,
    ornek: { ad: "kafeler için hazırladığımız örnek", url: `${KATALOG}/kurumsal/kafe/` },
    fayda: "Menünüz, fotoğraflarınız ve çalışma saatleriniz tek bir sayfada durur; isterseniz masalara QR menü de eklenir.",
  },
  {
    kod: "oto",
    ad: "Oto ve araç",
    desen: /(^|s)oto|otomotiv|araba|araç|(^|s)lastik|motosiklet|galeri|kiralama|yıkama|egzoz|akü|kaporta|rent a car|çekici/i,
    ornek: { ad: "oto işletmeleri için hazırladığımız örnek", url: `${KATALOG}/vitrin/galeri/` },
    fayda: "Hizmetleriniz ya da araçlarınız, çalışma saatleriniz, konumunuz ve tek dokunuşla arama düğmesi tek bir sayfada durur.",
  },
  {
    kod: "egitim",
    ad: "Kurs ve eğitim",
    desen: /kurs|eğitim|dershane|etüt|anaokul|kreş|yabancı dil|dil okulu|sürücü|akademi|öğretmen|müzik|sanat/i,
    ornek: { ad: "eğitim ve danışmanlık işletmeleri için hazırladığımız örnek", url: `${KATALOG}/vitrin/danismanlik/` },
    fayda: "Programlarınız, kayıt dönemleriniz ve kayıt için WhatsApp düğmesi tek bir sayfada durur.",
  },
  {
    kod: "buro",
    ad: "Büro ve danışmanlık",
    desen: /emlak|avukat|hukuk|muhasebe|mali müşavir|müşavir|danışman|sigorta|tercüme|mimar|seyahat|turizm|organizasyon|ajans/i,
    ornek: { ad: "bürolar için hazırladığımız örnek", url: `${KATALOG}/vitrin/danismanlik/` },
    fayda: "Hizmet alanlarınız, ekibiniz ve iletişim bilgileriniz derli toplu tek bir sayfada durur.",
  },
  {
    kod: "usta",
    ad: "Usta ve teknik servis",
    desen: /tesisat|elektrik|asansör|tadilat|boya|inşaat|yapı|pvc|pencere|cam|mobilya|marangoz|kombi|klima|çilingir|haşere|ilaçlama|temizl|halı|nakliyat|beyaz eşya|tamir|servis|demir|alüminyum|parke|kapı|perde|doğrama/i,
    ornek: { ad: "yapı ve servis işletmeleri için hazırladığımız örnek", url: `${KATALOG}/kurumsal/insaat/` },
    fayda: "Yaptığınız işlerden fotoğraflar, hizmet verdiğiniz bölgeler ve tek dokunuşla arama düğmesi tek bir sayfada durur.",
  },
  {
    kod: "uretim",
    ad: "Üretim ve toptan",
    desen: /imalat|üretim|fabrika|toptan|sanayi|matbaa|atölye|tedarik/i,
    ornek: { ad: "üretim firmaları için hazırladığımız örnek", url: `${KATALOG}/kurumsal/sanayi/` },
    fayda: "Ürünleriniz, üretim imkânlarınız ve teklif isteme düğmesi kurumsal bir sayfada durur.",
  },
  {
    kod: "magaza",
    ad: "Mağaza ve diğer",
    desen: /.*/,
    ornek: { ad: "hazır tasarımlarımız", url: `${SITE}/tasarimlar` },
    fayda: "Ürünleriniz ya da hizmetleriniz, çalışma saatleriniz, konumunuz ve WhatsApp düğmesi tek bir sayfada durur.",
  },
];

export const grupBul = (kategori) => GRUPLAR.find((g) => g.desen.test(kucuk(kategori))) ?? GRUPLAR.at(-1);

/** Hedef: sitesi olmayan ya da site yerine sosyal medya / platform kullanan, kamu olmayan işletme */
const SITESIZ = new Set(["yok", "sosyal", "siparis-platformu", "rezervasyon-platformu", "whatsapp"]);
export const hedefMi = (i) => SITESIZ.has(i.site?.tur ?? (i.webSitesi ? "site" : "yok")) && i.ad && !DISARIDA.test(kucuk(i.kategori));

/* ---------------------------------------------------------------- e-posta doğrulama */

const BEDAVA = new Set([
  "gmail.com", "hotmail.com", "hotmail.com.tr", "outlook.com", "outlook.com.tr", "yahoo.com", "yahoo.com.tr",
  "yandex.com", "yandex.com.tr", "icloud.com", "mynet.com", "windowslive.com", "live.com", "msn.com", "superonline.com", "ttmail.com",
]);
const GENEL = new Set([
  "ve", "the", "and", "ankara", "cankaya", "turkiye", "restoran", "restaurant", "lokantasi", "lokanta", "kafe", "cafe", "salonu",
  "merkezi", "klinigi", "klinik", "ltd", "sti", "tic", "san", "guzellik", "kuafor", "oto", "servis", "servisi", "ticaret",
  "sanayi", "insaat", "emlak", "kebap", "kebapcisi", "doner", "firin", "pastane", "pastanesi", "usta", "evi", "dunyasi", "subesi",
  "magazasi", "atolyesi", "studyo", "studio", "center", "merkez", "hizmetleri", "dis", "veteriner", "kursu", "egitim", "bufe",
]);

/** Türkçe duyarlı sadeleştirme → anlamlı kelimeler */
export const sade = (s, genelDahil = false) =>
  String(s ?? "")
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâî]/g, (h) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i" })[h])
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((k) => k.length >= 3 && (genelDahil || !GENEL.has(k)));

/**
 * Adresin bir parçası (kullanıcı adı ya da alan adı) işletme adından mı oluşuyor:
 * adın kelimeleri parçanın en az `oran` kadarını kaplamalı. Tek ortak kelime
 * yetmez — 2026-10-20 denemesinde "Dayı'nın yeri" için info@dayilarindayisi.com
 * "dayi" kelimesiyle eşleşmişti; başka işletme.
 */
const kaplar = (parca, ad, oran) => {
  const p = String(parca ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (p.length < 4) return false;
  /* Genel kelimeler ("döner", "kafe") kaplamaya sayılır ama tek başına yetmez: en az bir özel kelime şart */
  if (!sade(ad).some((k) => k.length >= 4 && p.includes(k))) return false;
  const ortu = [...new Set(sade(ad, true))].filter((k) => p.includes(k)).reduce((t, k) => t + k.length, 0);
  return ortu / p.length >= oran;
};
/** E-postanın kullanıcı adı ya da alan adı işletme adından oluşuyor mu */
export const adaUyar = (eposta, ad) => {
  const [yerel, alan = ""] = eposta.toLowerCase().split("@");
  const etiket = alan.split(".")[0];
  return kaplar(yerel, ad, 0.5) || (!BEDAVA.has(alan) && kaplar(etiket, ad, 0.6));
};
export const metneUyar = (metin, ad) => {
  const kelimeler = sade(ad);
  if (kelimeler.length === 0) return false;
  const m = new Set(sade(metin));
  return kelimeler.filter((k) => m.has(k)).length / kelimeler.length >= 0.5;
};

const EPOSTA = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}/gi;
const KOTU = /\.(png|jpe?g|gif|webp|svg)$|example\.|sentry|wixpress|@(sentry|domain|email|mail)\.|noreply|no-reply/i;
export const epostalariBul = (metin) =>
  [...new Set((String(metin ?? "").match(EPOSTA) ?? []).map((e) => e.toLowerCase().replace(/\.+$/, "")))].filter((e) => !KOTU.test(e));

/**
 * Güven: yuksek / orta → gönderilebilir; dusuk → yalnız elle bakılır.
 *  - Haritalar kaydı ya da işletmenin kendi Instagram biyografisi: yuksek
 *  - Özel alan adı + alan adında işletme adı: yuksek
 *  - Bedava posta (gmail…) + adresin içinde işletme adı: orta
 *  - Başka her şey (dizin sitesi, adı tutmayan adres): dusuk
 */
export function guvenBul(eposta, ad, kaynak) {
  if (kaynak === "harita" || kaynak === "instagram-harita") return "yuksek";
  const alan = eposta.split("@")[1] ?? "";
  const uyar = adaUyar(eposta, ad);
  if (!BEDAVA.has(alan) && kaplar(alan.split(".")[0], ad, 0.6)) return "yuksek";
  if (uyar) return kaynak === "instagram" ? "yuksek" : "orta";
  return "dusuk";
}
export const gonderilebilir = (guven) => guven === "yuksek" || guven === "orta";

/* ---------------------------------------------------------------- metinler */

/**
 * Metinde ve sorguda kullanılan ad: Haritalar'da adına anahtar kelime
 * dolduranlar var ("ZF GARAGE, Oto Servis, Oto Tamir…"). İlk virgül, dikey
 * çizgi ya da tireden önceki kısım alınır; hepsi büyük harfse düzeltilir.
 */
export function kisaAd(ad) {
  let a = String(ad ?? "").split(/\s*[,|–—]\s*|\s+-\s+/)[0].trim();
  if (a.length > 50) a = a.slice(0, 50).replace(/\s+\S*$/, "");
  if (a === a.toLocaleUpperCase("tr") && /[A-ZÇĞİÖŞÜ]{4,}/.test(a))
    a = a.toLocaleLowerCase("tr").replace(/(^|\s)(\p{L})/gu, (_, b, h) => b + h.toLocaleUpperCase("tr"));
  return a || String(ad ?? "");
}


const sayi = (n) => new Intl.NumberFormat("tr-TR").format(n);
const puanYaz = (p) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(p);

/** Haritalar cümlesi: yalnız taramada okunan puan ve yorum; az yorumda övgü yok */
function haritaCumlesi(i) {
  const tur = i.site?.tur ?? "yok";
  const eksik =
    tur === "sosyal"
      ? "haritada web sitesi yerine sosyal medya hesabınız görünüyor"
      : tur === "siparis-platformu" || tur === "rezervasyon-platformu"
        ? "haritada web sitesi yerine bir platform bağlantısı görünüyor"
        : "haritada bağlı bir web siteniz görünmüyor";
  if ((i.yorumSayisi ?? 0) >= 20 && i.puan >= 4)
    return `${i.ad}, Google Haritalar'da ${puanYaz(i.puan)} puan ve ${sayi(i.yorumSayisi)} yorumla öne çıkıyor; ama ${eksik}.`;
  return `${i.ad} için Google Haritalar'a baktık; ${eksik}.`;
}

/**
 * @param i defterdeki işletme
 * @param imza { ad: string|null, whatsapp: string }
 */
export function metinler(isletme, imza) {
  const i = { ...isletme, ad: kisaAd(isletme.ad) };
  const g = grupBul(i.kategori);
  const imzaSatiri = [imza.ad, "Elements of Technology · elementsoftechnology.com", `WhatsApp: ${imza.whatsapp}`].filter(Boolean).join("\n");
  const teklif = `İsterseniz bu tasarımı ${i.ad} için, kendi bilgilerinizle uyarlayıp size özel bir bağlantı olarak gönderelim. Bakmak ücretsiz; beğenmezseniz hiçbir yükümlülüğünüz yok.`;

  const eposta = {
    konu: `${i.ad} için bir web sitesi önerisi`,
    govde: [
      "Merhaba,",
      "",
      `${haritaCumlesi(i)} ${g.fayda}`,
      "",
      `${g.ornek.ad[0].toLocaleUpperCase("tr")}${g.ornek.ad.slice(1)}: ${g.ornek.url}`,
      "",
      teklif,
      "",
      "İyi çalışmalar,",
      imzaSatiri,
      "",
      "Bir daha yazmamızı istemezseniz \"hayır\" yazmanız yeterli.",
    ].join("\n"),
  };

  const whatsapp = [
    `Merhaba, ${i.ad} için yazıyorum. ${imza.ad ? `Ben ${imza.ad}, ` : ""}Elements of Technology'den.`,
    "",
    `${haritaCumlesi(i)} ${g.fayda}`,
    "",
    `Örnek: ${g.ornek.url}`,
    "",
    teklif,
    "",
    "İstemezseniz \"hayır\" yazmanız yeterli, bir daha yazmayız.",
  ].join("\n");

  const dm = `Merhaba! ${i.ad} için yazıyoruz, Elements of Technology'den. Haritada bağlı bir web siteniz görünmüyor. ${g.ornek.ad[0].toLocaleUpperCase("tr")}${g.ornek.ad.slice(1)}: ${g.ornek.url} — isterseniz size özel halini hazırlayıp gönderelim. İstemezseniz "hayır" yazmanız yeterli.`;

  return { grup: g.kod, grupAd: g.ad, ornek: g.ornek, eposta, whatsapp, dm };
}

/** wa.me bağlantısı: yalnız cep telefonu (05xx) — sabit hatta WhatsApp yok sayılır */
export function whatsappBaglantisi(numara, metin) {
  const n = String(numara ?? "").replace(/\D/g, "").replace(/^0/, "90");
  if (!/^905\d{9}$/.test(n)) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(metin)}`;
}
