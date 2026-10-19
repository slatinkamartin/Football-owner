# Databáze soupisek

Skutečné soupisky klubů 1. a 2. ligy. Teď obsahuje 27 klubů a 836 hráčů, stav k 19. 10. 2026: 16 klubů Chance Ligy (zdroj chanceliga.cz) a 11 klubů Chance Národní ligy (zdroj chnliga.cz). Role v kádru vychází z odehraných zápasů a minut v sezóně 2026/27. Kluby ČFL a MSFL mají vymyšlené hráče. Hra je načte při založení nové hry
(volba „Skutečné soupisky“). Kluby, které tu nejsou, dostanou vygenerované hráče.

## Soubory

- `hraci.csv`: jeden řádek = jeden hráč. Tento soubor upravujete.
- `kluby.csv`: seznam klubů 1. a 2. ligy a jejich `klub` (id), které se píše do `hraci.csv`. Slouží jen jako nápověda.

Oba soubory jdou otevřít v Excelu (UTF-8, oddělovač středník).

## Sloupce `hraci.csv`

| Sloupec | Povinný | Hodnoty |
|---|---|---|
| klub | ano | id klubu z `kluby.csv`, např. `slavia` |
| jmeno | ano | křestní jméno |
| prijmeni | ano | příjmení |
| rok_narozeni | ano | např. `2001` |
| pozice | ano | `BR` brankář, `OBR` obránce, `ZAL` záložník, `UT` útočník |
| narodnost | ne | česky, např. `Slovensko`; prázdné = `Česko` (cizinci se počítají do limitu cizinců, mimo EU potřebují povolení) |
| role | ne | `zaklad`, `rotace` (výchozí), `rezerva`, `talent` (hráč do 21 let, který zatím moc nehraje) |
| hodnoceni | ne | 25–92; prázdné = hra dopočítá z pověsti klubu, role a věku |
| potencial | ne | prázdné = hra dopočítá podle věku |
| smlouva_do | ne | rok konce smlouvy; prázdné = náhodně 1–3 roky |
| zdroj | ne | odkud údaj je (poznámka, hra ho nečte) |

Řádky začínající `#` se ignorují. Klub potřebuje aspoň 2 brankáře a 18 hráčů,
jinak hra chybějící doplní vygenerovanými hráči.

## Jak se hodnocení dopočítá

Základ je úroveň klubu (podle pověsti). K tomu se přičte role (`zaklad` +4,
`rezerva` −5, `talent` −3), mladí do 21 let a starší nad 32 let jsou slabší a
každý hráč má malý stálý rozptyl podle jména. Kdo chce přesnější hodnocení,
vyplní sloupec `hodnoceni` ručně.

## Kontrola

`npx vitest run engine/rosters.test.ts` ověří, že soubor jde přečíst, pozice
a roky dávají smysl a každý klub existuje. Vlastní soubor jde nahrát i přímo
ve hře na úvodní obrazovce („Nahrát vlastní soupisky“).
