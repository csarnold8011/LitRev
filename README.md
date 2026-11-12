# Szakirodalom-feldolgozó / Literature Review Tool

Kétnyelvű (magyar és angol) szakirodalmi feldolgozó felület BSc- és MSc-hallgatóknak, bármilyen témához. A hallgató egy közös, négy blokkból álló sablonnal dolgozza fel a forrásait, a témavezető pedig ugyanitt látja, értékeli és véleményezi a munkát. A nyelv a jobb felső sarokban bármikor átváltható, a beírt adatok megmaradnak.

## Szerepek és jogosultságok

| Szerep | Hogyan regisztrál | Mit tehet |
| --- | --- | --- |
| **Adminisztrátor** (te) | Övé a Google táblázat és az Apps Script | Beállítja a témavezetői regisztrációs kódot, jelszó-visszaállító linket készít, a táblázatban mindent lát és javíthat. |
| **Témavezető** | Az oldalon, a *Témavezetői regisztráció* fülön, a tőled kapott kóddal | Témákat hoz létre, hallgatókat vesz fel e-mail címmel, meghívó és jelszó-visszaállító linket készít a saját hallgatóinak, a saját témáinak feldolgozásait értékeli, a témát lezárhatja. |
| **Hallgató** | A témavezetőtől kapott meghívó linken, saját jelszóval | A témáiban feldolgozásokat ír, menti, beküldi a témavezetőnek, látja a témavezetői megjegyzést, letöltheti a feldolgozásokat Excelben. |

Egy témavezető több témát is létrehozhat, egy témában több hallgató is lehet, és egy hallgató több témában is szerepelhet. Mindenki csak azokat a témákat és feldolgozásokat látja, amelyekhez köze van. A jogosultságot a szerver ellenőrzi minden kérésnél, nem csak a felület.

**A feldolgozás állapotai:** Piszkozat (mentve, még nincs beküldve), Beadva (a hallgató beküldte értékelésre), Javítandó és Elfogadva (ezeket a témavezető állítja megjegyzéssel). A hallgató a javítás után újra beküldheti.

## Fájlok

| Fájl | Mire való |
| --- | --- |
| `index.html` | Az alkalmazás (GitHub Pages). |
| `config.js` | Egyetlen beállítás: az Apps Script webalkalmazás címe. |
| `apps-script/Code.gs` | A szerveroldali kód. A Google táblázat Apps Script szerkesztőjébe kell bemásolni, a GitHubon csak tárolásra van. |

## Telepítés (egyszer, kb. 15 perc)

### 1. Táblázat és Apps Script

1. Hozz létre egy új Google táblázatot, például **Szakirodalom-feldolgozó adatok** néven. Minden adat ebbe kerül, a témavezetők és a hallgatók soha nem látják közvetlenül.
2. A táblázatban: **Bővítmények → Apps Script**.
3. Töröld a mintakódot, és másold be az `apps-script/Code.gs` teljes tartalmát.
4. A fájl elején az `OLDAL_URL` sorba írd be a GitHub-oldal címét (lásd 2. lépés), például `'https://csarnold8011.github.io/LitRev/'`. Ez csak a menüből készített jelszó-visszaállító linkhez kell, ráérsz később is.
5. Mentés (Ctrl+S).
6. A felső függvényválasztóban válaszd az **elsoBeallitas** függvényt, és kattints a **Futtatás** gombra. Engedélyezd a hozzáférést a saját fiókoddal (a „Google nem ellenőrizte ezt az alkalmazást” ablakban: Speciális → Ugrás a projekthez). Létrejön az öt lap: Felhasznalok, Temak, Tagok, Meghivok, Cikkek.
7. **Üzembe helyezés → Új üzembe helyezés**, típus (fogaskerék ikon): **Webalkalmazás**.
   * Végrehajtás mint: **Én**
   * Hozzáféréssel rendelkezik: **Bárki**
8. **Üzembe helyezés**, majd másold ki a **webalkalmazás URL-jét** (`https://script.google.com/macros/s/.../exec`).

### 2. GitHub Pages

1. Hozz létre egy új **nyilvános** repót, például `LitRev` néven.
2. Töltsd fel az `index.html`, a `config.js` és az `apps-script` mappát (Add file → Upload files).
3. Szerkeszd a `config.js` fájlt a GitHubon, és illeszd be az 1. lépés végén kapott URL-t:
   ```js
   window.SZ_CONFIG = {
     apiUrl: 'https://script.google.com/macros/s/.../exec'
   };
   ```
4. **Settings → Pages**: Source: *Deploy from a branch*, Branch: *main*, mappa: */ (root)*. Mentés.
5. Egy-két perc múlva elérhető: `https://csarnold8011.github.io/LitRev/`

### 3. Témavezetői kód

1. Töltsd újra a táblázatot. Megjelenik a **Szakirodalom-feldolgozó** menü.
2. **Szakirodalom-feldolgozó → Témavezetői regisztrációs kód beállítása**, és adj meg egy legalább 6 karakteres kódot.
3. A kódot és az oldal címét add át a kollégáknak. Ezzel regisztrálnak témavezetőként. Ha a kódot lecseréled, a már regisztrált témavezetők továbbra is be tudnak lépni; ha üresen hagyod, a témavezetői regisztráció kikapcsol.

Ezután te magad is regisztrálj témavezetőként az oldalon, és próbáld ki: hozz létre egy teszttémát a saját másik e-mail címeddel mint hallgatóval, és nyisd meg a meghívó linket egy privát böngészőablakban.

## Így használja a témavezető

1. **Témáim → Új téma**: cím, rövid leírás, képzési szint (BSc, MSc, egyéb) és a hallgatók e-mail címei.
2. A mentés után minden hallgatóhoz megjelenik egy **meghívó link** (30 napig érvényes, egyszer használható). Az **E-mail** gomb megnyitja a levelezőt egy kétnyelvű, kitöltött levéllel; a **Másolás** gombbal máshová is beillesztheted.
3. A hallgató a linken megadja a nevét és a saját jelszavát, és már dolgozhat is.
4. A **Téma és hallgatók** fülön látszik, ki regisztrált már és kinek függ még a meghívója. Itt lehet hallgatót felvenni vagy eltávolítani, elveszett link helyett újat kérni, a témát lezárni vagy újranyitni. Ha egy hallgatónak már van fiókja (például egy másik témából), egyszerűen felveszed, és a téma megjelenik nála, link nélkül.
5. **Elfelejtett hallgatói jelszó:** a hallgató sorában a *Jelszó-visszaállító link* gomb (7 napig érvényes). Ezt a témavezető csak olyan hallgatónak készítheti, aki kizárólag az ő témáiban szerepel; minden más esetben az adminisztrátor segít.
6. A **Feldolgozások** fülön a *Beadva* állapotúakat megnyitva felül ott az értékelő panel: állapot és megjegyzés. A hallgató a megjegyzést a feldolgozás megnyitásakor kiemelve látja.

## Napi kezelés (adminisztrátor)

| Teendő | Hogyan |
| --- | --- |
| Témavezetői kód cseréje vagy kikapcsolása | Menü → Témavezetői regisztrációs kód beállítása |
| Elfelejtett jelszó (bárkinek, a témavezetőknek is) | Menü → Jelszó-visszaállító link készítése, a kapott linket elküldöd az illetőnek. Ehhez az `OLDAL_URL` legyen kitöltve. |
| Áttekintés | Menü → Áttekintés (felhasználók, témák, feldolgozások száma) |
| Felhasználó letiltása | Felhasznalok lap, **aktív** oszlop: `nem`. Azonnal kijelentkezik, és nem tud belépni. |
| Hallgatóból témavezető (például doktorandusz) | Felhasznalok lap, **szerep** oszlop: `témavezető` |
| Elemzés Excelben | Az oldalon bárki letöltheti a saját témáját (Feldolgozások → Letöltés táblázatként, oszlopválasztással). Te a Cikkek lapról is letöltheted: Fájl → Letöltés → Microsoft Excel; a **téma** oszlop mutatja, melyik témához tartozik. |
| Törölt feldolgozás visszaállítása | A Cikkek lapon a **Törölve** cellát ürítsd ki. Az oldalon a törlés csak elrejti a sort. |
| A Code.gs módosítása után | Üzembe helyezés → Üzembe helyezések kezelése → ceruza → Verzió: **Új verzió** → Üzembe helyezés. Így az URL nem változik. |
| A sablon (mezők, súgók) módosítása | Az `index.html` fájlban, a `TPL` résznél, mindkét nyelven. Meglévő mező kulcsát (`k`) ne nevezd át, mert az a Cikkek lap oszlopneve is; új mező nyugodtan felvehető, automatikusan új oszlop lesz belőle. A választható értékek a `CHOICES` résznél vannak. |

## Biztonság röviden

* A jelszavak és a témavezetői kód csak sózott, többszörösen hash-elt formában tárolódnak. A meghívó linkek is csak hash-ként kerülnek a táblázatba, így a táblázatból nem lehet működő linket kiolvasni.
* Belépés után a böngésző egy aláírt belépési kulcsot kap, amely két hétig érvényes. Jelszócserekor, jelszó-visszaállításkor vagy a fiók letiltásakor azonnal érvényét veszti.
* Tíz hibás jelszó után az adott e-mail cím 15 percre zárolódik; a témavezetői kódra ugyanez vonatkozik.
* Meghívó linket csak még nem regisztrált címre lehet készíteni, és nem lehet vele meglévő fiókot átvenni. Témavezető nem állíthatja vissza egy másik témavezető vagy egy más témavezetőhöz is tartozó hallgató jelszavát.
* A GitHubon lévő kód nyilvános, de titkot nem tartalmaz. Az Apps Script URL ismerete belépés nélkül nem ad hozzáférést.
* Ez a védelmi szint szakirodalmi jegyzetekhez megfelelő; személyes vagy érzékeny adat tárolására nem ajánlott.
* A DOI alapú kitöltés a Crossref nyilvános adatbázisát kérdezi le, az Excel-letöltés a SheetJS könyvtárat tölti be a cdnjs.cloudflare.com címről. Ha ez blokkolva van, a CSV-letöltés akkor is működik.

## Hibaelhárítás

* **„Az oldal még nincs beállítva”**: a `config.js` fájlban üres az `apiUrl`.
* **„A szerver nem a várt választ adta”**: az üzembe helyezésnél a hozzáférés nem *Bárki*, vagy rossz az URL a `config.js`-ben. Az URL-t böngészőben megnyitva ezt kell látni: `{"ok":true,"uzenet":"A Szakirodalom-feldolgozó szervere működik." ...}`
* **„A témavezetői regisztráció jelenleg nincs bekapcsolva”**: még nincs beállítva a kód (menü).
* **„Ezt a linket már felhasználták vagy visszavonták”**: a hallgató már regisztrált (lépjen be), vagy a témavezető közben új linket készített, illetve eltávolította a hallgatót.
