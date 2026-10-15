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

## Co umí verze 0.5

- Výběr klubu z 1. až 3. ligy a startovních podmínek (osobní kapitál majitele).
- Týdenní tahy, celé sezóny se 4 soutěžemi (1. liga, 2. liga, ČFL, MSFL), postupy a sestupy včetně pravidel pro B-týmy.
- **Zápasový engine:** simulace po minutách, střely s xG, góly a asistence, fauly, žluté a červené karty, zranění, až 5 střídání, známky hráčů a hráč zápasu. Trenér skládá sestavu podle formace (4-3-3, 4-4-2, 5-3-2), kvality a kondice a hráče rotuje.
- **Náhled zápasu:** sestavy, střídání, karty, xG, střely, držení míče, rohy, fauly, průběh zápasu a známky.
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
- **Smlouvy:** prodlužování, uvolnění hráče, odchody po skončení smlouvy (důležitým hráčům prodlužuje ředitel sám).
- Stárnutí a vývoj hráčů, odchody do důchodu, dorost z akademie.
- Automatické ukládání v prohlížeči (IndexedDB), záloha do souboru.

## Známá zjednodušení

- Hráči jsou generovaní. Skuteční hráči 1. a 2. ligy přijdou jako samostatný datový balíček.
- Složení 2. a 3. ligy v datech je pracovní a je potřeba ho ověřit podle FAČR.
- Ostatní kluby mezi sebou přestupy řeší souhrnně v letním okně.
- Spoluvlastníci, stadion, fanoušci a média přijdou v dalších fázích.
