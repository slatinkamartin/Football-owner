# Majitel – koncept hry (verze 0.2)

Strategická hra, ve které hráč není trenér, ale **majitel (nebo spolumajitel) fotbalového klubu**. Rozhoduje o směřování, penězích, lidech, stadionu a značce. Taktiku a sestavu řídí trenér, kterého si najal.

> Název: **Majitel**. Dokument shrnuje odpovědi ze dvou kol dotazníku a navrhuje, jak je převést na herní systémy.

---

## 1. Základní parametry

| Oblast | Rozhodnutí |
|---|---|
| Platforma | Webová hra v prohlížeči |
| Režim | Single-player |
| Tempo | Tahové, jeden tah = jeden týden (v klíčových obdobích lze zastavit na den) |
| Tón | Mezi realistickým simulátorem a přístupnou hrou: hloubka čísel, ale srozumitelné UI a příběhové události |
| Cíl hry | Nekonečný sandbox **i** scénáře s cílem (kampaně) |
| Svět | Skutečný svět, skutečné kluby a hráči, start v české fotbalové pyramidě |
| Rozsah | Datový model pro více zemí a evropské poháry od začátku, v první verzi jen ČR |
| Jazyk | Čeština |
| Konec hry | Bankrot klubu nebo majitele = game over, trestní odsouzení majitele = game over |
| Délka sezóny | Cca **2 hodiny** reálného hraní |
| Startovní podmínky | Nastavitelné na startu hry (kapitál, podíl, klub, obtížnost) |
| Vzhled | **Světlé a jednoduché** UI, přehledné karty a tabulky |

---

## 2. Herní smyčka

**Týden (tah):**
1. Přehled: výsledky, tabulka, finance, zprávy a e-maily od ředitelů, médií a investorů.
2. Rozhodnutí: schvalování návrhů (přestupy, smlouvy, rozpočty), vlastní iniciativy (stavba, marketing, nábor), reakce na události.
3. „Pokračovat“: simulace zápasů a ekonomiky, posun kalendáře.

**Sezóna:**
- Letní příprava, letní přestupní okno, podzim, zimní pauza a zimní okno, jaro, konec sezóny (postupy, sestupy, licence).
- Čtvrtletní **zasedání představenstva / dozorčí rady**, roční **valná hromada** (účetní závěrka, dividendy, volby, velká hlasování).
- **Licenční řízení FAČR** před sezónou: požadavky na stadion, finance a akademii podle soutěže.

**Tempo (cíl 2 hodiny na sezónu):** sezóna má zhruba 45 až 50 týdenních tahů, tedy průměrně 2 až 3 minuty na tah. Klidné týdny lze přeskočit automaticky („pokračovat do další události“), rutinu řeší ředitelé a majitele zastaví jen rozhodnutí, která vyžadují jeho pozornost. Rušnější jsou přestupní okna, zasedání a konec sezóny.

**Dlouhodobě:** budování značky, stadionu a akademie, růst podílu ve klubu, postup pyramidou až do Evropy, případný prodej klubu se ziskem.

---

## 3. Vlastnictví (hlavní odlišující prvek)

Klub je **akciová společnost** (běžné u českých klubů). Hráč drží určitý podíl akcií.

**Jak se k podílu dostaneš (podle scénáře):**
- koupě celého klubu na začátku,
- vstup jako menšinový investor a postupné dokupování,
- převzetí klubu od města, od krachujícího majitele, od spolku apod.

**Spolumajitelé (NPC):** každý má motivaci a osobnost, například:
- *Investor:* chce zhodnocení a dividendy, nesnáší ztráty.
- *Místní patriot:* chce úspěch, odchovance a dobré vztahy s fanoušky, peníze řeší méně.
- *Spekulant:* chce klub výhodně prodat, podpoří prodej hráčů a pozemků.
- *Město:* chce stabilitu, mládež a dobrou pověst, často vlastní stadion nebo pozemky.

**Hlasování a pravomoci:**
- Běžná rozhodnutí: prostá většina (> 50 %).
- Zásadní rozhodnutí (stavba stadionu, navýšení kapitálu, velký úvěr, prodej majetku, změna stanov): kvalifikovaná většina (např. 2/3 nebo 75 %).
- Menšinový majitel musí přesvědčovat: vyjednávání, ústupky, výměna hlasů, mediální tlak.
- Majitel s malým podílem může být **odvolán z vedení**.

**Po odvolání (pasivní akcionář):** hra pokračuje. Hráč nemá přímé pravomoci, ale dostává zprávy, hlasuje na valné hromadě a může se pokusit o **návrat**:
- dokoupit akcie od ostatních spoluvlastníků nebo přes navýšení kapitálu,
- vytvořit koalici s jinými akcionáři a prosadit změnu vedení,
- svolat mimořádnou valnou hromadu,
- využít krizi nového vedení (špatné výsledky, finanční problémy) a nabídnout záchranu,
- mediální kampaň a podpora fanoušků jako tlak na ostatní akcionáře.

Alternativně může podíl prodat a koupit jiný klub.

**Kapitálové operace:**
- nákup a prodej akcií (od spoluvlastníků, předkupní právo),
- navýšení základního kapitálu (s ředěním podílů ostatních, pokud nepřispějí),
- půjčka klubu od majitele (úrok, splatnost, podřízenost),
- dividendy (jen ze zisku, schvaluje valná hromada),
- **prodej klubu** nebo podílu kupci s nabídkou podle hodnoty klubu.

**Osobní finance majitele:** oddělená peněženka. Startovní kapitál se volí v nastavení nové hry (od skromného podnikatele po miliardáře), což zároveň určuje obtížnost. Majitel může vkládat vlastní kapitál, půjčovat si (např. proti zástavě akcií) a má vedlejší příjmy (pasivní příjem z „jiného podnikání“). Osobní bankrot je také konec hry.

**Regulace:** FAČR licence, pravidla UEFA o finanční udržitelnosti (např. poměr nákladů na kádr k příjmům) při účasti v Evropě. Pravidla jsou parametrizovaná podle země, aby šla později doplnit i jiná (např. 50+1 v Německu).

---

## 4. Lidé a delegování

Majitel najímá **hlavního trenéra a ředitele sekcí**. Ředitelé si sami najímají své podřízené v rámci rozpočtu, který jim majitel schválí.

| Role | Odpovídá za |
|---|---|
| Hlavní trenér | Taktika, sestava, rozvoj hráčů, výsledky |
| Sportovní ředitel | Kádr, přestupy, smlouvy hráčů, skauting |
| Finanční ředitel | Rozpočet, cash flow, úvěry, účetnictví, upozornění na rizika |
| Obchodní a marketingový ředitel | Sponzoři, vstupenky, merch, značka, sociální sítě |
| Ředitel akademie | Mládež, trenéři mládeže, nábor talentů |
| Ředitel stadionu a provozu | Stadion, zařízení, stavební projekty, akce mimo zápasy |
| Mluvčí / PR | Média, krizová komunikace |

**Osobnost zaměstnanců:** schopnosti (např. kvalita práce, vyjednávání, práce s mládeží), plus povaha: ambice, loajalita, ego, styl (útočný či defenzivní trenér, preference mladých hráčů, šetrnost). Ovlivňují výsledky i vztahy.

**Vztahy a důvěra:** každý klíčový zaměstnanec má k majiteli vztah. Majitel může trenérovi „radit“ (např. „hrajte víc s mladými“), ale silný nebo ješitný trenér to může nést špatně: horší vztah, únik do médií, rezignace. Podobně u sportovního ředitele při přetlačování přestupů.

---

## 5. Hráči a přestupy

**Detail hráče (částečný):**
- pozice, věk, národnost, smlouva, plat, tržní hodnota,
- celkové hodnocení a potenciál (s nejistotou podle kvality skautingu),
- několik klíčových vlastností (např. rychlost, technika, fyzička, mentalita, vůdcovství) a rysy povahy (profesionál, náladový, věrný, žoldák),
- forma, zranění, morálka.

**Kdo přestupy řídí:**
- Standardně je navrhuje **sportovní ředitel** a majitel schvaluje rozpočet a velké transakce.
- Majitel může **sám najít hráče**, ale návrh musí projít přes sportovního ředitele: ten dá posudek a vyjednává. Prosazení hráče proti jeho názoru stojí důvěru.

**Vyjednávání (složitější):**
- *S klubem:* odstupné, splátky, bonusy za výkony, podíl z dalšího prodeje, opce na odkup, hostování s opcí či povinností.
- *S hráčem a agentem:* plat, podpisový bonus, odměna agenta, délka smlouvy, výstupní klauzule, bonusy (góly, starty, postup), zvyšování platu.
- Protistrany mají vlastní cíle, trpělivost a ochotu. Agenti mají reputaci a vztah s klubem.

**Akademie:** velké téma. Investice do zařízení a trenérů zlepšuje kvalitu a počet talentů. Prodej odchovanců je legitimní byznys model. Kategorie licence akademie.

**Multi-club ownership:** ne.

---

## 6. Finance (plné účetnictví)

**Výkazy:** výsledovka, rozvaha, cash flow. Měsíční a roční pohled.

**Příjmy (široká škála):** vstupenky, permanentky, VIP a skyboxy, catering, TV práva, odměny od soutěží a UEFA, solidární platby, sponzoring (generální partner, dres, naming rights stadionu), merch, prodej hráčů, podíly z dalších prodejů, akce na stadionu (koncerty), pronájmy, dotace města a státu (např. na mládež a infrastrukturu).

**Výdaje:** platy hráčů a zaměstnanců, odměny agentům, nákupy hráčů, provoz stadionu a zařízení, akademie, cestování, marketing, úroky, daně, pokuty.

**Realistické účetní prvky:**
- odpisy budov a staveb,
- **amortizace hráčských registrací** (cena hráče rozložená do délky smlouvy, zisk z prodeje = cena mínus zůstatková hodnota),
- daň z příjmů právnických osob,
- úvěry s podmínkami (kovenanty), splátkové kalendáře, závazky po splatnosti.

**Bankrot:** záporný cash flow bez financování → upomínky, zablokované přestupy, ztráta licence, insolvence → **game over**. Finanční ředitel varuje včas.

**Ekonomické události:** inflace, recese, změny TV smluv, odchod sponzora, regulace sázkových společností jako sponzorů, kurzy měn (při expanzi do zahraničí).

---

## 7. Stadion a infrastruktura (budovatelská část)

Úroveň detailu „c“: **budovatelská strategie s městskou politikou**.

- **Pozemky:** koupě, pronájem, nebo jsou ve vlastnictví města. Územní plán určuje, co kde smí stát.
- **Povolovací proces:** studie, územní řízení, stavební povolení, připomínky sousedů, odvolání. Trvá měsíce až roky a může se zaseknout.
- **Modulární stavba:** jednotlivé tribuny, sektory (sezení, stání, hosté, rodinný sektor), VIP a skyboxy, střecha, osvětlení, vyhřívaný trávník, kamerový systém, parkoviště, fanshop, restaurace, muzeum.
- **Výstavba:** fáze, zhotovitel (cena vs. spolehlivost), zpoždění a vícenáklady, snížená kapacita během stavby, případně dočasné hraní jinde.
- **Další zařízení:** tréninkové centrum, akademie, regenerace a medicína, ubytování mládeže, kanceláře.
- **Licenční požadavky:** každá soutěž má minima (kapacita, osvětlení, vyhřívání apod.), bez nich klub nesmí postoupit nebo hrát doma.

**Město a politika:** vztah s vedením města, komunální volby každé 4 roky (změna vedení mění postoj ke klubu), protesty obyvatel (hluk, doprava), dohody o spolufinancování, pronájem městského stadionu.

---

## 8. Marketing, fanoušci a média

**Fanoušci:** velikost základny (místní, regionální, národní, zahraniční), segmenty (ultras, tradiční fanoušci, rodiny, firemní klientela, příležitostní diváci), každý segment má jiné preference a reaguje jinak na ceny, výsledky, rebranding nebo odchod oblíbeného hráče. Spokojenost ovlivňuje návštěvnost a příjmy.

**Ceny:** vstupenky a permanentky podle sektorů, elasticita poptávky, kapacitní limity.

**Značka:** logo a barvy (rebranding má riziko odporu tradičních fanoušků), dresy a výrobce, sociální sítě, obsah, mezinárodní expanze (zájezdy, partnerství, cílené trhy).

**Sponzoři:** nabídky podle pověsti a dosahu, vyjednávání, etická rozhodnutí (sázkové kanceláře, kontroverzní firmy).

**Média a pověst:** zpravodajský kanál, tiskové konference a rozhovory jako volby s důsledky, kauzy a krize, novináři s různým postojem. **Pověst majitele** se sleduje zvlášť u fanoušků, médií, svazu, města a investorů.

---

## 8a. Šedá zóna

Hra obsahuje nabídky a příležitosti mimo pravidla. Jsou dobrovolné, lákavé a riskantní.

**Příklady:**
- ovlivňování zápasů a rozhodčích,
- úplatky úředníkům (rychlejší stavební povolení, změna územního plánu, dotace),
- „černé“ platy a provize mimo účetnictví, daňové triky,
- skryté vazby na sázkové kanceláře,
- kupování politické podpory ve městě.

**Riziko odhalení:** každý takový krok zvyšuje skrytou míru rizika. Hrozí únik informací (nespokojený zaměstnanec, novinář, vyšetřování policie nebo svazu). Riziko roste s počtem zapojených lidí a klesá s jejich loajalitou.

**Důsledky:** mediální skandál a pád pověsti, odchod sponzorů, pokuty, odečet bodů, nucený sestup, ztráta licence, zákaz činnosti majitele ve fotbale (vede k nucenému prodeji podílu) a v nejhorším případě trestní stíhání, které znamená konec hry.

---

## 9. Simulace zápasů

- Zobrazuje se **jen výsledek a statistiky** (střelci, karty, držení míče, střely, hodnocení hráčů).
- Sestavu a taktiku volí AI trenéra podle jeho stylu a kvality.
- Výsledek ovlivňuje: kvalita kádru, kvalita a styl trenéra, morálka, forma, únava, zranění, domácí prostředí (návštěvnost, stadion), kvalita zázemí (méně zranění, lepší regenerace) a náhoda.
- Model: pravděpodobnostní (Poissonův model gólů podle síly útoku a obrany, upravený o uvedené faktory). Náhoda je výrazná v jednom zápase, ale dlouhodobě vyhrává kvalita.

Simulace celé ligy a ostatních soutěží běží každý týden na pozadí.

---

## 10. Svět a data

- **Start: Česko.** Skutečné kluby v **1. lize, 2. lize a 3. lize (ČFL, MSFL)**. Divize a nižší soutěže jsou volitelné a generované. Domácí pohár.
- **Hráči:** skuteční hráči v 1. a 2. lize, ve 3. lize a níže generovaní.
- **Datový model je od začátku mezinárodní** (země, soutěže, kluby, hráči, pravidla licencí a přestupů), takže doplnění dalších zemí a evropských pohárů je hlavně otázka dat.
- **Datové balíčky:** veškerý obsah světa (kluby, hráči, stadiony, města) je v oddělených datových souborech, ne v kódu. Lze je upravovat a vyměňovat.

### Pozor: skutečná jména a data

- **Práva:** jména a podoby skutečných hráčů a loga a ochranné známky klubů a soutěží jsou chráněné (licence hráčů často přes hráčské asociace, loga a názvy soutěží jsou ochranné známky). Pro **soukromé hraní** to nevadí. Při **veřejném šíření** je to riziko. Rozhodnuto: hru stavět na datových balíčcích, nikdy nepoužívat oficiální loga, a pro případné zveřejnění mít připravený fiktivní balíček (skutečné kluby, vymyšlení hráči), zatímco skutečný balíček zůstane soukromý nebo komunitní.
- **Zdroj dat:** automatické stahování z webů jako Transfermarkt porušuje jejich podmínky. Reálnější cesty: ruční sestavení (soupisky jsou veřejné na webech klubů a FAČR), otevřená data (Wikidata pro kluby, stadiony, města), a vlastní ohodnocení hráčů. Pro nižší soutěže skutečná data prakticky nejsou, tam dává smysl generovat hráče.

---

## 11. Cíle a scénáře

**Sandbox:** v nastavení nové hry se volí klub, podíl, startovní kapitál, spoluvlastníci a obtížnost. Hraje se, dokud klub nezkrachuje nebo hráč neskončí.

**Scénáře (příklady):**
1. *Zachraň tradici:* zadlužený klub s historií, 2 sezóny na stabilizaci financí.
2. *Z divize do Evropy:* malý klub, cíl evropské poháry do 15 let.
3. *Menšinový investor:* 20 % akcií, cíl získat kontrolu a postavit nový stadion.
4. *Město prodává:* převezmi klub od města, které chce zachovat vliv.
5. *Rychlý exit:* kup levně, zvedni hodnotu, prodej se ziskem.

**Hodnocení majitele (odkaz):** trofeje, hodnota klubu, finanční zdraví, stadion, odchovanci, spokojenost fanoušků, osobní zisk.

---

## 12. Technické řešení (návrh)

| Vrstva | Volba | Proč |
|---|---|---|
| Jazyk | **TypeScript** | Typová bezpečnost pro rozsáhlý herní model |
| UI | **React + Vite** | Hra je hlavně tabulky, přehledy a formuláře, React je na to ideální |
| Herní jádro | Čistý TS modul bez závislosti na UI | Testovatelný, deterministický, běží ve **Web Workeru** (UI se nezasekne při simulaci) |
| Náhoda | Seedovaný generátor | Opakovatelné simulace, ladění, testy |
| Ukládání | **IndexedDB** (knihovna Dexie) + export/import uložené hry do souboru | Single-player nepotřebuje server, data zůstávají v prohlížeči a jde je zálohovat |
| Data světa | JSON datové balíčky s validací (Zod) | Snadná úprava, výměna, kontrola chyb |
| Testy | Vitest | Jednotkové testy ekonomiky, simulace a pravidel |
| Grafy | Lehká knihovna grafů (např. Recharts) | Finance a statistiky |
| Později | Tauri (desktopová aplikace), případně server pro žebříčky | Bez přepisu jádra |

**Struktura projektu (návrh):**
```
KONCEPT.md
app/            # React UI
engine/         # herní jádro: svět, kalendář, ekonomika, simulace, AI
data/           # datové balíčky (cz-zaklad, ...)
```

---

## 13. MVP – první hratelná verze

Cíl: odehrát několik sezón a cítit, že rozhodnutí majitele mají dopad.

1. Jedna země (ČR), 1. až 3. liga s postupy a sestupy, domácí pohár volitelně.
2. Nastavení nové hry: výběr klubu, scénáře a startovního kapitálu, koupě podílu, jeden až dva NPC spoluvlastníci a jednoduché hlasování.
3. Najímání trenéra a sportovního ředitele (ostatní ředitelé zatím zjednodušeně).
4. Rozpočet na platy a přestupy, jednoduché přestupy (nabídka a protinabídka; složité vyjednávání ve 2. fázi).
5. Týdenní tahy, simulace zápasů a tabulek.
6. Finance: výsledovka, cash flow, základní rozvaha, odpisy a amortizace, úvěr, bankrot = game over.
7. Stadion v jednoduchých úrovních (modulární stavba a povolení ve 2. fázi).
8. Fanoušci a návštěvnost v závislosti na výsledcích a cenách.
9. Ukládání a načítání hry.

**Další fáze (orientačně):**
- **Fáze 2:** plné vyjednávání přestupů a smluv, všichni ředitelé s osobnostmi, akademie, sponzoři, média a události, šedá zóna.
- **Fáze 3:** budovatelský stadion, pozemky, povolení, městská politika.
- **Fáze 4:** valná hromada, kapitálové operace, odvolání a návrat majitele, prodej klubu, scénáře.
- **Fáze 5:** další země a evropské poháry, regulace UEFA.

---

## 14. Rozhodnutí z 2. kola

| Otázka | Rozhodnutí |
|---|---|
| Hloubka pyramidy | Skutečné kluby v 1. až 3. lize, nižší soutěže volitelně generované |
| Skuteční hráči | V 1. a 2. lize skuteční, níže generovaní. Datové balíčky ano |
| Startovní kapitál | Podle nastavení na startu hry |
| Délka sezóny | Cca 2 hodiny |
| Odvolání majitele | Pasivní akcionář s možností návratu |
| Šedá zóna | Ano, s rizikem odhalení a trestů |
| Vzhled | Světlé a jednodušší |
| Název | Majitel |

## 15. Stav vývoje

**Verze 0.1 (hotovo):** projekt (Vite, React, TypeScript), herní jádro s kalendářem, simulací zápasů, financemi, postupy a sestupy, datový balíček s kluby 1. až 3. ligy a základní rozhraní. Podrobnosti v [README](README.md).

**Verze 0.2 (hotovo):** trenér a sportovní ředitel s vlastnostmi a důvěrou, cíl sezóny, rady trenérovi, přestupní okna, návrhy ředitele, vyjednávání o odstupném a smlouvě, nabídky na vlastní hráče, smlouvy a volní hráči.

**Verze 0.3 (hotovo):** ekonomika kalibrovaná podle české ligy (hodnoty, platy, prémie, odměny za umístění, strukturální ztráta), zahraniční kupci, řazení a filtrování všech tabulek.

**Verze 0.4 (hotovo):** zápasový engine se střelami a xG, sestavy a rotace, kondice, zranění, karty a tresty, střídání, známky hráčů a náhled zápasu.

**Verze 0.5 (hotovo):** karty hráčů a klubů s vývojem a kariérou, průběžný vývoj hráčů, forma a morálka, nadstavba 1. ligy, baráž, domácí pohár, výsledovka a rozvaha s odpisy a daní, tlačítko „Do zápasu“ a grafy.

**Verze 0.6 (hotovo):** stadion a zázemí, situace k rozhodnutí, nálada fanoušků, generální partner, úvěr, přestupy mezi kluby v lize, kalendář sezóny.

**Další krok:** spolumajitelé (akcionáři, hlasování, valná hromada, dividendy), šedá zóna, média.
