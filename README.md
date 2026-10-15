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

## Co umí verze 0.1

- Výběr klubu z 1. až 3. ligy a startovních podmínek (osobní kapitál majitele).
- Týdenní tahy, celé sezóny se 4 soutěžemi (1. liga, 2. liga, ČFL, MSFL), postupy a sestupy včetně pravidel pro B-týmy.
- Simulace zápasů (Poissonův model podle síly sestavy), tabulky, střelci, návštěvnost.
- Finance klubu: vstupné, TV peníze, komerční příjmy, platy, provoz, přestupy. Bankrot = konec hry.
- Rozhodnutí majitele: cena vstupenek, mzdový rozpočet, rozpočet na letní posily, vklad vlastního kapitálu.
- Stárnutí a vývoj hráčů, odchody do důchodu, dorost z akademie.
- Automatické ukládání v prohlížeči (IndexedDB), záloha do souboru.

## Známá zjednodušení

- Hráči jsou generovaní. Skuteční hráči 1. a 2. ligy přijdou jako samostatný datový balíček.
- Složení 2. a 3. ligy v datech je pracovní a je potřeba ho ověřit podle FAČR.
- 1. liga zatím nemá nadstavbu, sestupují přímo 2 kluby (bez baráže).
- Přestupy řeší sportovní ředitel souhrnně v letním okně. Vyjednávání, trenéři, ředitelé a spoluvlastníci přijdou v dalších fázích.
