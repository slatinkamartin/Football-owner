# Majitel

Strategická hra v prohlížeči, ve které řídíš fotbalový klub jako jeho majitel nebo spolumajitel: finance, lidi, přestupy, stadion, marketing a vztahy se spoluvlastníky. Taktiku a sestavu nechává na trenérovi.

Koncept hry: [KONCEPT.md](KONCEPT.md)

## Spuštění

Potřebuješ Node.js 20 nebo novější.

```bash
npm install
npm run dev        # vývojový server na http://localhost:5173
npm test           # testy herního jádra
npm run build      # produkční sestavení do složky dist/
```

## Struktura

| Složka | Obsah |
|---|---|
| `engine/` | Herní jádro bez závislosti na UI: kalendář, rozlosování, simulace zápasů, finance, postupy a sestupy |
| `app/` | Uživatelské rozhraní (React) |
| `data/cz-zaklad/` | Datový balíček: soutěže a kluby české pyramidy (1. až 3. liga) |

## Co umí verze 0.9

- Výběr klubu z 1. až 3. ligy, startovních podmínek (osobní kapitál majitele) a podílu v klubu (100 %, 60 % nebo 35 %).
- Týdenní tahy, celé sezóny se 4 soutěžemi (1. liga, 2. liga, ČFL, MSFL), postupy a sestupy včetně pravidel pro B-týmy.
- **Zápasový engine:** simulace po minutách, střely s xG, góly a asistence, fauly, žluté a červené karty, zranění, až 5 střídání, známky hráčů 1–10 a hráč zápasu. Trenér skládá sestavu podle formace (4-3-3, 4-4-2, 5-3-2), kvality a kondice a hráče rotuje.
- **Náhled zápasu:** rozestavení obou týmů na hřišti se známkami a góly, sestavy, střídání, karty, xG, střely, držení míče, rohy, fauly, průběh zápasu a známky.
- **Kondice, zranění a tresty:** stopka za červenou kartu a za každou 4. žlutou, zranění na dny až měsíce.
- Tabulky, statistiky hráčů (zápasy, minuty, góly, asistence, karty, průměrná známka), návštěvnost.
- Finance klubu: vstupné, TV peníze, komerční příjmy, platy, provoz, přestupy. Bankrot = konec hry.
- Rozhodnutí majitele: cena vstupenek, mzdový rozpočet, rozpočet na přestupy, vklad vlastního kapitálu.
- **Vedení:** hlavní trenér a sportovní ředitel se schopnostmi a povahou (ambice, ego, loajalita), důvěra ve majitele, nábor z volných kandidátů, odvolání s odstupným, rezignace.
- **Cíl sezóny:** majitel ho stanoví, plnění ovlivňuje důvěru trenéra a ředitele.
- **Rady trenérovi:** styl hry a práce s mladými. Ješitný trenér radu nemusí přijmout.
- **Přestupy:** letní (1. 7. – 31. 8.) a zimní (8. 1. – 14. 2.) okno, návrhy sportovního ředitele ke schválení, vlastní hledání hráčů se skautskými odhady, vyjednávání s klubem (odstupné) a s hráčem (plat, délka smlouvy), nabídky ostatních klubů na naše hráče, hráči na prodej, volní hráči.
- **Ekonomika podle české ligy:** hodnoty hráčů podle Transfermarktu (podle kvality, věku, potenciálu a soutěže), tržní platy podle úrovně klubu, prémie za body, odměny za umístění, strukturální ztráta klubů.
- **Zahraniční kupci:** kluby z Anglie, Německa, Nizozemska, Belgie, Polska a dalších zemí kupují nejlepší hráče za skutečné peníze. Prodeje jsou hlavní zdroj příjmů jako v realitě.
- **Řazení a filtry:** všechny tabulky se řadí kliknutím na hlavičku, filtry si hra pamatuje.
- **Karty hráčů:** hodnocení a potenciál, hodnota, forma, morálka, kondice, statistiky sezóny, grafy vývoje hodnocení a hodnoty, kariéra po sezónách a přestupy. Otevřou se kliknutím na jméno kdekoli ve hře.
- **Karty klubů:** umístění, trenér, stadion, poslední zápasy a kádr se skautskými odhady.
- **Vývoj hráčů:** průběžně každý měsíc podle věku, odehraných minut a trenéra.
- **Forma a morálka:** ovlivňují výkon. Hráči, kteří nehrají, jsou nespokojení, neprodlouží smlouvu a přitahují nabídky.
- **Soutěže:** nadstavba 1. ligy (skupina o titul, o umístění a o záchranu), baráž o 1. ligu a domácí pohár s prémiemi.
- **Účetnictví:** výsledovka s odpisy hráčských registrací a ziskem z prodejů, rozvaha, daň z příjmů 21 % s převodem ztrát.
- **Pohodlí:** tlačítko „Do zápasu“ se souhrnem zápasu, grafy pozice v tabulce a zůstatku klubu.
- **Stadion a zázemí:** nové tribuny, VIP skyboxy, catering a fanshop, vyhřívaný trávník (licence 1. ligy), tréninkové centrum, akademie, regenerace. Stavby trvají týdny, zapisují se do rozvahy a odepisují se.
- **Situace k rozhodnutí:** přes 30 druhů, mimo jiné název stadionu, zájem o trenéra, benefiční zápas, výjezdy fanoušků, nabídka investora, požadavky svazu, tiskové konference, rozhovory a kauzy hráčů; původních 14 (soustředění, prohřešky hráčů, prémie, sponzoři, protesty fanoušků, pokuty, talenty z akademie, zranění, dotace, nespokojení hráči, trávník, asistent trenéra, výběr generálního partnera) s dopadem na peníze, morálku a důvěru.
- **Fanoušci a partneři:** nálada fanoušků ovlivňuje návštěvnost a komerční příjmy, smlouva s generálním partnerem (pevná, nebo s bonusy za výhry), příjmy z cateringu a VIP, úvěr od banky.
- **Přestupy v lize:** ostatní kluby si během oken kupují hráče mezi sebou a podepisují volné hráče.
- **Kalendář sezóny:** stále viditelný proužek nad záložkami (přestupní okna, části ligy, nadstavba, baráž, pohár, dnešek), kliknutím se rozbalí termíny.
- **Spolumajitelé:** finanční investor, místní patriot, spekulant a město s vlastními zájmy a spokojeností. Hlasují o úvěrech, velkých stavbách a navýšení kapitálu. Odhadní hodnota klubu, nákup a prodej akcií, navýšení kapitálu, prodej celého klubu jako konec hry.
- **Valná hromada:** každý červen dividenda (vám jde podle podílu) a hlasování o důvěře. Nespokojená většina majitele odvolá; pak klub řídí představenstvo a cesta zpět vede přes nákup většiny, mimořádnou valnou hromadu, mediální kampaň nebo pozvání od akcionářů.
- **Pověst majitele:** u médií (ovlivňuje sponzory a akcionáře) a u fotbalového svazu (ovlivňuje výši pokut).
- **Na hraně etiky:** obrazová práva místo platů, zakázky pro vlastní firmu, neoficiální jednání s hráči, pochybní sponzoři, nadsazená návštěvnost, obcházení výchovného, dar starostovi. Přinesou peníze nebo výhodu, ale zvyšují skryté riziko kauzy: pokuty, vratky, odečet bodů, nespokojení akcionáři, při opakování roční zákaz činnosti.
- **Další ředitelé:** finanční (nižší provozní náklady), obchodní (vyšší komerční příjmy), šéf akademie (lepší dorostenci) a tiskový mluvčí (pověst u médií).
- **Smlouvy:** prodlužování, uvolnění hráče, odchody po skončení smlouvy (důležitým hráčům prodlužuje ředitel sám).
- Stárnutí a vývoj hráčů, odchody do důchodu, dorost z akademie.
- Automatické ukládání v prohlížeči (IndexedDB), záloha do souboru.

### Novinky verze 0.22: celek hry (etapa H)

- **Výroční zpráva sezóny**: po konci sezóny se ukáže umístění, splnění cíle, finanční vysvědčení, hráč sezóny, nejlepší střelec, nejlepší a nejhorší rozhodnutí majitele, zlomové okamžiky a nové trofeje.
  - Archiv zpráv je v menu Hra (kapitola).
- **Scénáře s cílem a hodnocením (1–3 hvězdy)**:
  - Záchrana (Zlín, 2 sezóny): klub v minusu s úvěrem;
  - Vzestup (Kolín, 5 sezón): dostat klub do 1. ligy;
  - Evropa (Hradec, 3 sezóny): s městem a patriotem jako spolumajiteli;
  - Prodejní model (Jablonec, 4 sezóny): čistý zisk z prodejů 500 mil.
  - Splněný scénář se zapíše do síně slávy.
- **Kariéra majitele**: po prodeji klubu lze pokračovat s penězi a odkazem v jiném klubu.
  - Velké kluby berou jen majitele s úspěchy (odkaz nebo mediální jméno).

### Novinky verze 0.21: stadion (etapa G)

- **Sektory stadionu**:
  - kotel (malý / střední / velký): domácí prostředí, vztah s kotlem, cena lístku, výtržnosti;
  - rodinný sektor (žádný / malý / velký): návštěva, útrata, klidnější atmosféra.
- **Nabídky akcí místo posuvníku**: koncert, firemní den, zápas reprezentace (vztah se svazem), zimní kluziště.
  - U každé je příjem, termín a riziko pro trávník (vyšší těsně před domácím zápasem).
  - Ve výhledu jsou jen přijaté akce.
- **Stav stadionu a kategorie**:
  - údržba drží stav; úsporná ho nechá chátrat, pod 45 přicházejí poruchy, pod 25 zázemí ztratí hvězdu;
  - pro Evropu je potřeba kategorie 3, jinak klub hraje jinde a přijde o 15 % příjmů ligové fáze.
- **Velké stavby**:
  - volba dodavatele: levný −10 % a častější prodražení, nebo spolehlivý +5 % a prodražení vzácné;
  - povolení od města trvá podle vztahu;
  - poklepání základního kamene zlepší vztah se sponzorem;
  - slavnostní otevření stadionu přinese vstupné.
- **Zážitek ze dne zápasu** (menší stavby): fanzóna (útrata +10 %), rodinná zóna (návštěva +3 %), klubové muzeum (příjem roste s trofejemi), velkoplošná obrazovka (reklama).

### Novinky verze 0.20: majitel a okolí (etapa F)

- **Vaše podnikání** (Majitel):
  - příjem z firem kolísá podle roku v oboru (skvělý rok ×1,6, krize ×0,3);
  - osobní peníze jdou investovat bezpečně (asi 3 %) nebo rizikově (v průměru 8 %, kolísá);
  - klub může sponzorovat vaše firma: rychlé peníze, ale střet zájmů (šedá zóna, nespokojení investoři).
- **Nabídka na převzetí celého klubu** (o 30 % nad hodnotou): prodat a skončit s hodnocením éry, vyjednat víc, nebo odmítnout.
- **Město**:
  - primátor s postojem ke klubu a vztah s klubem;
  - volby každé čtyři roky;
  - vztah rozhoduje o povolení stadionu a komerčního areálu, o příspěvku města a šanci na dotace;
  - primátora jde pozvat do VIP.
- **Kotel a fanklub**:
  - vztah podle cen, výsledků, prodejů opor a přísnosti ochranky;
  - nadšený kotel zvedá domácí prostředí a návštěvu, naštvaný zlobí;
  - při odmítnutí schůzky hrozí bojkot.
- **Síň slávy**: tituly, poháry, postupy, Evropa, nový stadion, rekordní prodeje a odchovanci. Odkaz éry přitahuje sponzory (až +20 %).

### Novinky verze 0.19: finance (etapa E)

- **Vedlejší cíle sezóny** na Přehledu, s průběžným plněním. Vyhodnocení na konci sezóny přinese bonus nebo ztrátu vztahu.
  - Generální partner: průměrná návštěva.
  - Město: minuty hráčů do 21 let.
  - Akcionáři: provozní výsledek aspoň nula.
- **Co když…** (Finance › Přehled): výhled sezóny při prodeji nejlepšího hráče, vyšším mzdovém stropu o 20 %, stavbě nového stadionu nebo krizi nálady fanoušků.
- **Sponzoři se závazky**:
  - firemní akce s hráči (vztah se sponzorem, bonus, únava hráčů);
  - nabídka loga na rukáv;
  - vztah se sponzorem mění nabídky při prodlužování (±10 %).
- **Finanční šoky a příležitosti**: dražší energie (zaplatit, nebo úsporný režim), nová TV smlouva ligy, krach sponzora, refinancování úvěru, sbírka fanoušků v krizi.
- **Finanční vysvědčení A–F** na konci sezóny podle kapitálu, výsledku, dluhu a likvidity. Mění úrok bank (A −1,5 bodu, E +2,5, s F banka provozní úvěr nedá) a spokojenost akcionářů.
- **Finanční fair play** v 1. a 2. lize: ztráty za tři sezóny nad limit (polovina ročních nákladů; vklady majitele se počítají napůl) znamenají napomenutí, pak omezení přestupů (nejvýš 2 hráči za odstupné), pak pokutu.

### Novinky verze 0.18: přestupy (etapa D)

- **Deadline day**: poslední tři dny okna hra zastaví a jde po dnech (s možností přeskočit na konec okna).
  - Nabídky na vaše hráče platí den a soupeři nakupují každý den.
  - Kluby uvolňují hráče se slevou 15 %.
- **Konkurence o hráče**:
  - o dobrého hráče se může přetahovat jiný klub; prodávající chce přeplatit jeho nabídku a agent jeho plat;
  - prohraný souboj znamená, že hráč odejde ke konkurentovi;
  - o vaše hráče se mohou přetahovat dva kupci.
- **Agenti jako postavy**:
  - šest agentů s povahou: férový, chamtivý, s kontakty do ciziny;
  - vztah mění odměny a platy;
  - dobrý vztah přináší tipy na hráče (o 10 % levněji), chamtivý agent se špatným vztahem pouští informace médiím.
- **Klauzule**:
  - výstupní klauzule (hráč chce o 10 % nižší plat, ale může odejít, když někdo klauzuli zaplatí);
  - doplatek 30 % při postupu nebo Evropě (prodávající bere nabídku asi o 15 % výš).
- **Domino po prodeji opory**: ředitel hned navrhne náhradu v rámci utržených peněz. Bez náhrady do konce okna klesne nálada fanoušků.
- **Sledovaní hráči**: hvězdička v Tabulkách a na kartě hráče. Ředitel hlásí výhodnou chvíli (končící smlouva, nespokojenost, klub v krizi, tip agenta, deadline day).

### Novinky verze 0.17: lidé (etapa C)

- **Žádosti hráčů**: přidat na platu, víc minut, volno kvůli rodině, nová smlouva po skvělé sezóně. Vyhovět stojí peníze nebo klid v kabině, odmítnutí sráží morálku.
- **Požadavky vedení**:
  - trenér chce posilu na konkrétní pozici: slib se hlídá do konce okna, splněný zvedne důvěru (+6), porušený ji srazí (−10);
  - akademie chce víc minut pro mladé;
  - trenér chce víc peněz na medicínu, když je moc zraněných.
- **Přetahování**: o úspěšného trenéra i sportovního ředitele mají zájem jiné kluby. Přidat, pustit za odstupné, nebo trvat na smlouvě.
- **Pohovor při najímání** trenéra a sportovního ředitele:
  - otázky na mladé, rozpočet a pravomoci;
  - pohovor prozradí povahu kandidáta (ego, ambice, loajalita, vztah k mladým);
  - odpovědi určí výchozí důvěru;
  - slib rozpočtu se hlídá celou sezónu (porušení −15).
- **Hodnocení trenéra po podzimu**: pochvala, ultimátum na 5 jarních zápasů (aspoň 8 bodů), nebo odvolání v zimní pauze.
- **Pravomoci ředitelů** (Vedení):
  - sportovní ředitel: malé / střední / plné; jen s plnými sám nakupuje a prodává;
  - obchodní ředitel sám podepisuje sponzory na volná místa;
  - finanční ředitel sám schvaluje návrh rozpočtu.
- **Přijímačky dorostu** (Kádr): akademie každé léto představí 4–6 dorostenců s odhadem potenciálu, smlouvu dostanou 2–3. Ostatní odejdou mezi volné hráče, kde je může podepsat soupeř.

### Novinky verze 0.16: zápasy a liga (etapa B)

- **Příprava na zápas** na Přehledu:
  - taktika jako doporučení trenérovi (přijme podle důvěry a ega), rotace opor, mimořádná prémie za výhru, akce pro fanoušky (poloviční vstupné, choreo) a návštěva kabiny;
  - u zápasů se sázkou (derby, přímý soupeř, souboj o čelo, záchrana, pohár, závěr sezóny) příprava sama vyskočí;
  - výsledek zápasu se sázkou má dvojnásobný vliv na fanoušky a média.
- **Živý přenos** na tlačítko: první poločas, rozhodnutí do kabiny (nic neměnit / víc riskovat / bránit), pak druhý poločas. Náhled je poctivý: skutečný zápas proběhne do 45. minuty stejně.
- **Tisková konference** po výjimečných zápasech (derby, rozdíl 4 gólů, vyloučení, sporná situace), nejvýš jednou za dva týdny: pochvala, kritika, podpora trenéra, výpad proti rozhodčímu s rizikem pokuty, odvolání proti trestu.
- **Zátěž a kalendář** a **cesta pohárem** v Zápasech.
- **Tabulky**:
  - šance na titul, Evropu a sestup z 300 simulací zbytku sezóny a šance na cíl sezóny;
  - rivalové (derby, přímý soupeř);
  - zpravodaj kola (překvapení, střelec, sestava kola: pochvala zvedá morálku i zájem kupců);
  - graf vývoje sezóny s rivaly a zlomovými okamžiky (odvolaný trenér, prodej opory, zranění).
- **Soupeři mají povahu majitele**: rozhazovačný, šetřílek (v krizi prodává levněji), nervózní (vyhazuje trenéry), akademie. Ukazuje ji karta klubu.

### Novinky verze 0.15: příběhy, nálady, porada a tempo (etapa A)

- **Týdenní porada** nahoře na Přehledu: až pět úkolů na tento týden podle stavu klubu (rozhodnutí s termínem, nabídky, rozpočet, chybějící peníze, licence, vedení, konec okna, nespokojené opory, končící smlouvy, nevyužité peníze). Každý úkol vede tam, kde se řeší.
- **Příběhy sezóny**: vícetýdenní dějové linky s několika rozhodnutími.
  - *Krize výsledků*: po třech prohrách podpora, ultimátum, nebo mlčení; po dalších třech zápasech vyhodnocení, případně odvolání trenéra.
  - *Hvězda chce odejít*: slib odchodu a pak nabídka v okně, lepší smlouva, nebo odmítnutí.
  - *Tlak médií*: tisková konference s vyhodnocením za 4 týdny, rozhovor, nebo mlčení.
  - *Spor v kabině*: trest, kapitán, nebo trenér; za 2 týdny vyhodnocení.
- **Nálady kolem klubu**: fanoušci, média, kabina, vedení a akcionáři, s trendem za 4 týdny a třemi posledními důvody změn.
- **Hrát do…**: do příštího zápasu, milníku, konce měsíce nebo sezóny. Hra se zastaví dřív při nové situaci, výhodné nabídce, zranění opory nebo milníku a řekne proč.
- **Nastavení hry** (Hra): kolik se toho děje (klid / běžně / drama), přísnost svazu (pokuty), náhoda v zápasech a kdy se má hrát do… zastavit.

### Novinky verze 0.14: zahraniční trh a velké investice

- **Zahraniční skauting** (Přestupy › Zahraniční trh): skautské sítě v šesti regionech (Slovensko a Polsko, Balkán, Skandinávie, Afrika, Jižní Amerika, hostování z velkých lig) za roční poplatek. Skauti v každém regionu vyhlédnou pět hráčů, trh se obnoví 1. 7. a 1. 12.
- **Nejistý odhad**: hodnocení i potenciál se ukazují jako rozpětí. Zúží ho sledování (každý týden, nejvýš 5 hráčů), skautské oddělení, schopný ředitel, analytika a partnerský klub.
- **Cena cizince**: odstupné (menší ligy prodávají levněji), odměna agentovi, u hráčů mimo EU pracovní povolení. Hráčů mimo EU smí být v kádru nejvýš sedm.
- **Zabydlování**: cizinec první měsíce hraje slaběji (až o 12 %). Rychleji se zabydlí s krajanem v kádru nebo s integračním programem.
- **Hostování s opcí** z velkých lig: bez odstupného, opci lze využít během sezóny, jinak se hráč 30. 6. vrací.
- **Sportovní ředitel** smí podle přestupové politiky nakupovat i v regionech se skautskou sítí. Ostatní kluby ligy také kupují v cizině, takže liga drží krok.
- **Fanoušci**: sedm a více cizinců v základní sestavě kazí náladu fanoušků i patriotů. Hvězdná posila ji zvedne.
- **Velké investice** (Stadion): nový stadion (dvě velikosti), tréninkový areál, komerční areál.
  - Platí se měsíčně po dobu stavby a město přispěje. Na splátky lze čerpat investiční úvěr.
  - Hrozí prodražení a zpoždění.
  - Rozestavěná stavba je majetek v rozvaze a odepisuje se po dokončení.
  - U každé stavby je odhad návratnosti.
- **Programy klubu**: B-tým (vývoj mladých), ženský tým (nálada, město, sponzor), analytické oddělení (přesnější skauting, síla +1), partnerský klub v zahraničí (region zdarma, přesnější odhady, levnější hráči), integrační manažer.
- **Finance**: nové řádky Zahraniční skauting, Programy klubu a Komerční areál. Splátky staveb jsou ve výhledu i v závazcích na další sezóny.

### Novinky verze 0.13: stabilita na dlouhé hraní (test 3 týmů × 5 sezón)

- **Důvěra vedení:** každý měsíc se pomalu vrací k normálu, průběžně se trestá jen výrazné zaostání za cílem, za titul, pohár a postup je bonus. Když majitel situaci nerozhodne a vyřeší ji vedení, vztahy utrpí jen málo.
- **Zastupující trenér a ředitel:** když místo zůstane prázdné, klub dosadí zastupujícího (slabšího a levnějšího), ve Vedení je označený. Ředitel prodlužuje smlouvy bez ohledu na důvěru.
- **Cíl sezóny:** na začátku každé sezóny (i po postupu a sestupu) vedení navrhne dosažitelný cíl; změnit ho jde ve Vedení.
- **Ředitel nakupuje:** se zapnutou péčí o kádr koupí v přestupním okně posilu na nejslabší místo, když je výrazně lepší a vejde se do rozpočtu (jeden nákup nejvýš za 60 % zbývajícího rozpočtu).
- **Kádr se nerozpadá po sestupu:** prodloužení smí využít místo po odcházejících platech, návrh rozpočtu vždy pokryje podepsané smlouvy a nouzově doplnění hráči mají úroveň soutěže.
- **Ceny hráčů:** nad hodnocením 76 hodnota roste pomaleji, zahraniční nabídky mají strop podle úrovně kupce (nejvýš asi 20 mil. €).
- **Peníze bohatých:** hráči dostávají 15 % evropských peněz jako prémie, bohaté kluby ligy zvedají platy, Přehled financí upozorní na nevyužité peníze.
- **Výhled:** Evropa se před předkoly ukazuje jako rozsah, potřeba od majitele má rezervu 3 % nákladů.

### Novinky verze 0.12.1: sjednocené škály

- **0–100:** hráči (hodnocení, potenciál, kondice, morálka), schopnosti vedení, pověst, nálada fanoušků, důvěra, vztahy, spokojenost akcionářů, síla základní sestavy, domácí prostředí, riziko a závažnost v šedé zóně.
- **Známka 1–10:** hodnocení hráčů v zápase a průměrná známka v sezóně.
- **Hvězdy:** tréninkové centrum, akademie a medicína 1–5 hvězd, catering a fanshop 1–4 hvězdy.
- U nálady v kabině, motivace trenéra a domácího prostředí je vedle hodnoty 0–100 i vliv na sílu týmu v bodech hodnocení.

### Novinky verze 0.12: přestupová politika a dopady změn

- **Nová podzáložka Přestupy ve Financích:** rozpočet na odstupné, minimální rezerva, prodejní politika, samostatnost ředitele, splátky a podíly z dalších prodejů. Propisuje se do Příjmů (prodeje), Výdajů (nákupy) i do Rozpočtu (řádek Přestupy vede sem).
- **Dovysvětlivky ke každé změně:** u posuvníků a voleb se hned ukáže dopad proti současnému nastavení (provozní výsledek, peníze na konci sezóny, nálada fanoušků za rok) a co to udělá ve hře (návštěva, trávník, zranění, domácí výhoda, síla týmu, výtržnosti, vztahy s městem).
- **Přehlednější vodopád:** vodorovné řádky Příjmy → Platy → Ostatní provozní výdaje → Provozní výsledek → Přestupy → Investice a daň → Úvěry → Změna peněz, s legendou a vysvětlením po najetí.
- **Opravy:** soustředění dává bonus jen podle zaplacené volby (po zaplacení je zamčené); prodejní klub nikdy sám neprodá 6 opor a stihne prodej před zavřením okna; výhled přestupů hlídá minimální rezervu; „běžná“ volba už nehlásí neschválenou změnu; srovnání s ligou počítá platy bez rezervy a provoz se všemi řádky; výhled počítá s tím, jak ceny a údržba během sezóny mění náladu fanoušků.
- **Vyvážení:** poškozený trávník ubere 40 % domácí výhody; úsporná údržba zvýší zranění o 12 % a ubere 10 % domácí výhody, špičková stojí +15 % a zranění sníží o 10 %; soustředění v zahraničí +1 k síle týmu, bez soustředění −0,8; prémiové ceny cateringu a fanshopu víc štvou fanoušky.

### Novinky verze 0.11: řádky rozpočtu propojené se hrou

- **Finance mají jasné role:** Přehled (grafický přehled), Rozpočet (výsledovka ke schválení, nic se v ní nenastavuje), Příjmy a Výdaje (každý řádek rozpočtu má kartu s ovládáním, „Ovlivňuje:“, srovnáním s ligou a pruhem skutečnost/výhled), Financování, Účetnictví. Klik na řádek výsledovky otevře jeho kartu.
- **Nové řádky příjmů:** ceny cateringu a VIP, fanshop a dresy (ceny, nová kolekce), akce na stadionu (příjem proti poškození trávníku), prodejní politika (víc nebo méně nabídek, ředitel sám prodává).
- **Nové řádky výdajů:** údržba stadionu a trávníku (zranění, trávník, nálada), letní a zimní soustředění (forma na startu podzimu a jara), pořadatelé a bezpečnost (riziko pokut za výtržnosti), komunita, ženský a dětský fotbal (město, patrioti, dotace, média), minimální rezerva peněz.
- **Rozpočet:** výsledovka Příjmy → Provozní výdaje → Provozní výsledek → Přestupy, investice a daň → Změna peněz, sloupce Schváleno / Výhled / Skutečnost / Loni, závazky na tři další sezóny. Upozornění na neschválené změny ukazuje jejich skutečný dopad.
- **Přehled:** vodopád sezóny, složení příjmů a výdajů, „Kde jsme v lize“ (příjmy, platy, sponzoři, vstupné, peníze).
- Okna milníků vedou rovnou na správnou podzáložku Financí. Uložené hry se převedou (verze 10).

### Novinky verze 0.10.1: milníky sezóny

- Tlačítko „Týden ›“ se před důležitým bodem sezóny změní na konkrétní krok („Do startu ligy ›“, „Do konce okna ›“, „Do licence ›“, „Do konce sezóny ›“…) a posune přesně na něj. „Do zápasu ›“ milník nikdy nepřeskočí.
- Na milníku vyskočí okno: co nastává, aktuální čísla (kádr, zbývající peníze na přestupy, stav licence, odhad odměny a daně, končící smlouvy) a tlačítka „Co teď udělat“.
- Milníky: nová sezóna, termín rozpočtu, start ligy, Evropa, konec letního okna, zimní pauza, zimní okno (otevření a konec), start jara, licence a náprava licence, nadstavba, konec sezóny.

### Novinky verze 0.10: finance, které sedí

- **Výhled = skutečnost + zbytek sezóny.** Rozpočet, Přehled i licence počítají peníze den po dni od dneška do konce června (zápasy podle rozpisu, výplaty prvního v měsíci, splátky, Evropa, pohár, odměna za umístění). V březnu už neukazují nesmysly.
- **Přesnější řádky plánu:** platy ve smlouvách a prémie zvlášť od rezervy ve mzdovém stropu, přestupy jako utraceno + splátky + zbytek rozpočtu (bez dvojího započtení splátek), domácí pohár, daň z příjmů, investice, úvěry a vklady mimo výsledek.
- **Dva jasné pojmy:** provozní výsledek (bez přestupů, investic, daně a financování) a změna peněz na účtu (všechno). Stejné členění používá rozpočet, přehled i peněžní toky v účetnictví.
- **Neschválené změny** se hlásí jen při změně nastavení. Posun výhledu kvůli výsledkům se ukáže jako informace.
- **Potřeba od majitele:** když by klubu došly peníze, hra řekne kolik a kdy a nabídne půjčku nebo vklad jedním klikem. Licenční varování odhaduje stav k 31. 3. stejně jako svaz (vlastní kapitál a neuhrazené závazky).
- **Nový Přehled financí** se otevře vždy jako první: stav peněz se semaforem, graf skutečnost + čárkovaný výhled, hlavní ukazatele, „Sezóna v číslech“ (skutečnost z výhledu po položkách) a kalendář peněz.
- Opravy: bankovní úvěry podle velikosti soutěže, jednotná hranice drahého vstupného (+10 %), lepší odhad prémií, účetnictví bez nulových řádků a bez „-0 Kč“.

### Novinky verze 0.9.2: drobnosti ve Financích

- **Živý plán:** každá změna (například vyšší mzdový strop) se hned propíše do plánovaného rozpočtu. Když se liší od schváleného, ukáže se upozornění a sloupec „Schváleno“. Odkaz „Vrátit na návrh vedení“ vrátí nastavení.
- **Plán k dnešku a loňská sezóna:** shrnutí rozpočtu ukazuje plán, schválenou verzi, část plánu k dnešnímu dni, skutečnost s odchylkou a loňskou skutečnost.
- **Posuvníky s okamžitým náhledem:** u vstupného (návštěva a příjem ze zápasu), permanentek a přestupů. Na mzdovém stropu je značka, kde jsou současné platy.
- **Kalendář peněz** na 12 měsíců (pravidelné toky a termíny) a **měsíční uzávěrka** ve zprávách.
- **Končící smlouvy:** od března nabídky na prodloužení sponzorů (první od současného partnera) a v Nákladech hráči s končící smlouvou s tlačítkem Prodloužit.
- Jednotné zaokrouhlení částek (tis. Kč a mil. Kč) a upozornění bez duplicit.

### Novinky verze 0.9: Finance

- **Finance s podzáložkami:**
  - Přehled: ukazatele, upozornění, kam jdou peníze, vývoj zůstatku.
  - Rozpočet: čtyři kroky s plánem v kostce.
  - Příjmy, Náklady a Financování.
  - Účetnictví: výsledovka, rozvaha, výkaz peněžních toků, pohyby.
- **Mzdový rozpočet po sekcích:** opory, základ, rotace a mladí, každá s vlastním rozpočtem. Hráče řadí hra podle role a dají se přeřadit ručně. Sportovní ředitel podepisuje a prodlužuje jen v rámci sekce, vyjednávání ukazuje, kolik v sekci zbývá. Platová hierarchie ovlivňuje náladu v kabině. Přehled podepsaných platů na další tři sezóny.
- **Systém prémií:**
  - vyšší pevné platy;
  - vyvážený;
  - nižší pevné platy a vysoké prémie, kdy hráči víc táhnou.

  Prémie za splnění cíle.
- **Sponzorská místa:** generální partner, dres, název stadionu, dodavatel dresů, pivovar, tréninkové centrum, mládež. Nabídky na 1–3 roky, pevná částka nebo bonusy za umístění, pohár a Evropu. Na nabídky, na které majitel nereaguje, podepíše obchodní oddělení nejvyšší.
- **Financování:**
  - půjčka majitele (vrací se s úrokem, svaz ji bere jako vlastní zdroje);
  - kontokorent;
  - provozní a investiční úvěr;
  - prodej budoucích TV peněz;
  - dotace na mládež, stavby a energie.
- **Přestupy:** odstupné ve splátkách (pohledávky a závazky v rozvaze), prodej s podílem z dalšího přestupu.
- **Licenční řízení** 31. 3. s nápravou do 31. 5. Při nesplnění pokuta a odečet bodů.
- **Krizový režim:** po druhém měsíci v minusu krizový plán (záchranný vklad, výprodej, snížení platů), insolvence až po čtvrtém.

### Novinky verze 0.8

- **Ekonomika zdola:** platy hráčů jsou hlavním nákladem klubů (55–65 % nákladů). Sponzoři platí podle velikosti a pověsti klubu a nálady fanoušků. Provoz klubu a stadionu se počítá zvlášť od oddělení. Běžný klub 1. ligy hospodaří zhruba vyrovnaně a ztráty kryjí prodeje hráčů nebo majitel.
- **Rozpočet sezóny:** na začátku sezóny ho připraví finanční ředitel (nebo účetní) a majitel ho do 15. 7. upraví a schválí. Nastavuje se vstupné, permanentky, mzdový strop, peníze na přestupy a rozpočty oddělení. Hra ukáže plánovaný výsledek, zůstatek po měsících, kontrolu licence a soulad s cílem sezóny. Spolumajitelé o rozpočtu hlasují. Během sezóny se plán porovnává se skutečností.
- **Oddělení:** skauting (přesnost odhadů), mládež (kvalita dorostu), medicína (zranění) a marketing (sponzoři a fanoušci), s klesajícím výnosem.
- **Permanentky:** prodají se při schválení rozpočtu, jejich držitelé pak neplatí vstupné.
- **Evropské poháry:** první čtyři kluby ligy a vítěz poháru hrají předkola. Postup do ligové fáze podle síly kádru přináší desítky až stovky milionů a pověst.
- **Úspěch se vyplácí:** pověst roste rychleji, když klub překoná očekávání, za titul a pohár. Velké kluby bez úspěchů naopak pomalu ztrácejí.
- **Ostatní kluby hospodaří:** utrácí, co vydělají, přebytky investují a peníze z Evropy nehromadí.
- **Lidé na hřišti:** domácí prostředí podle zaplnění stadionu a nálady fanoušků, motivace trenéra podle jeho důvěry v majitele, nálada v kabině a spokojenost hráčů s platem.
- **Opravy:** při postupu nebo sestupu se přepočítá vstupné a rozpočty. Smlouvy mají sestupovou klauzuli (platy −30 %). Sportovní ředitel sám prodlužuje smlouvy a doplňuje kádr na 22 hráčů v rámci mzdového stropu (dá se vypnout). Počet volných hráčů je omezený.

## Známá zjednodušení

- Hráči jsou generovaní. Skuteční hráči 1. a 2. ligy přijdou jako samostatný datový balíček.
- Složení 2. a 3. ligy v datech je pracovní a je potřeba ho ověřit podle FAČR.
- Ostatní kluby mezi sebou přestupy řeší souhrnně v letním okně.
