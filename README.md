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

## Co umí verze 0.2

- Výběr klubu z 1. až 3. ligy a startovních podmínek (osobní kapitál majitele).
- Týdenní tahy, celé sezóny se 4 soutěžemi (1. liga, 2. liga, ČFL, MSFL), postupy a sestupy včetně pravidel pro B-týmy.
- Simulace zápasů (Poissonův model podle síly sestavy), tabulky, střelci, návštěvnost.
- Finance klubu: vstupné, TV peníze, komerční příjmy, platy, provoz, přestupy. Bankrot = konec hry.
- Rozhodnutí majitele: cena vstupenek, mzdový rozpočet, rozpočet na přestupy, vklad vlastního kapitálu.
- **Vedení:** hlavní trenér a sportovní ředitel se schopnostmi a povahou (ambice, ego, loajalita), důvěra ve majitele, nábor z volných kandidátů, odvolání s odstupným, rezignace.
- **Cíl sezóny:** majitel ho stanoví, plnění ovlivňuje důvěru trenéra a ředitele.
- **Rady trenérovi:** styl hry a práce s mladými. Ješitný trenér radu nemusí přijmout.
- **Přestupy:** letní (1. 7. – 31. 8.) a zimní (8. 1. – 14. 2.) okno, návrhy sportovního ředitele ke schválení, vlastní hledání hráčů se skautskými odhady, vyjednávání s klubem (odstupné) a s hráčem (plat, délka smlouvy), nabídky ostatních klubů na naše hráče, hráči na prodej, volní hráči.
- **Smlouvy:** prodlužování, uvolnění hráče, odchody po skončení smlouvy (důležitým hráčům prodlužuje ředitel sám).
- Stárnutí a vývoj hráčů, odchody do důchodu, dorost z akademie.
- Automatické ukládání v prohlížeči (IndexedDB), záloha do souboru.

## Známá zjednodušení

- Hráči jsou generovaní. Skuteční hráči 1. a 2. ligy přijdou jako samostatný datový balíček.
- Složení 2. a 3. ligy v datech je pracovní a je potřeba ho ověřit podle FAČR.
- 1. liga zatím nemá nadstavbu, sestupují přímo 2 kluby (bez baráže).
- Ostatní kluby mezi sebou přestupy řeší souhrnně v letním okně.
- Spoluvlastníci, stadion, fanoušci a média přijdou v dalších fázích.
