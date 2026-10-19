import type { ScoutRegion } from './types';
export const FIRST_NAMES = [
  'Adam', 'Aleš', 'Antonín', 'David', 'Dominik', 'Filip', 'František', 'Jakub', 'Jan', 'Jaroslav',
  'Jiří', 'Josef', 'Kamil', 'Karel', 'Kryštof', 'Lukáš', 'Marek', 'Martin', 'Matěj', 'Michal',
  'Milan', 'Ondřej', 'Patrik', 'Pavel', 'Petr', 'Radek', 'Roman', 'Šimon', 'Stanislav', 'Tadeáš',
  'Tomáš', 'Václav', 'Vít', 'Vojtěch', 'Zdeněk', 'Daniel', 'Denis', 'Libor', 'Matyáš', 'Robin',
  'Sebastián', 'Tobiáš', 'Vladimír', 'Erik', 'Hynek', 'Igor', 'Ladislav', 'Miroslav', 'Oldřich', 'Richard',
];

export const LAST_NAMES = [
  'Novák', 'Svoboda', 'Novotný', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Němec',
  'Pokorný', 'Marek', 'Pospíšil', 'Hájek', 'Jelínek', 'Král', 'Růžička', 'Beneš', 'Fiala', 'Sedláček',
  'Doležal', 'Zeman', 'Kolář', 'Navrátil', 'Čermák', 'Vaněk', 'Urban', 'Blažek', 'Kříž', 'Kovář',
  'Bartoš', 'Vlček', 'Polák', 'Musil', 'Kopecký', 'Šimek', 'Konečný', 'Malý', 'Holub', 'Štěpánek',
  'Kadlec', 'Dostál', 'Soukup', 'Šťastný', 'Mareš', 'Moravec', 'Sýkora', 'Tichý', 'Valenta', 'Vávra',
  'Matoušek', 'Bláha', 'Říha', 'Ševčík', 'Bureš', 'Hruška', 'Mašek', 'Pavlík', 'Janda', 'Hrubý',
  'Mach', 'Kratochvíl', 'Hronek', 'Klíma', 'Sláma', 'Kubíček', 'Řezníček', 'Jireš', 'Toman', 'Hanák',
  'Vacek', 'Lukeš', 'Brabec', 'Krejčí', 'Šebesta', 'Petrů', 'Ondráček', 'Skála', 'Vondra', 'Hladík',
];

/** Obce pro generované kluby, které doplňují soutěže zespodu. */
export const POOL_TOWNS: { town: string; region: 'cechy' | 'morava' }[] = [
  { town: 'Benátky nad Jizerou', region: 'cechy' },
  { town: 'Mělník', region: 'cechy' },
  { town: 'Kutná Hora', region: 'cechy' },
  { town: 'Klatovy', region: 'cechy' },
  { town: 'Strakonice', region: 'cechy' },
  { town: 'Trutnov', region: 'cechy' },
  { town: 'Náchod', region: 'cechy' },
  { town: 'Litoměřice', region: 'cechy' },
  { town: 'Rokycany', region: 'cechy' },
  { town: 'Jindřichův Hradec', region: 'cechy' },
  { town: 'Hulín', region: 'morava' },
  { town: 'Bystřice pod Hostýnem', region: 'morava' },
  { town: 'Valašské Meziříčí', region: 'morava' },
  { town: 'Šumperk', region: 'morava' },
  { town: 'Přerov', region: 'morava' },
  { town: 'Břeclav', region: 'morava' },
  { town: 'Kopřivnice', region: 'morava' },
  { town: 'Bohumín', region: 'morava' },
  { town: 'Třebíč', region: 'morava' },
  { town: 'Rousínov', region: 'morava' },
];

/**
 * Zahraniční kluby, které kupují hráče z české ligy. Úroveň 1 = top 5 lig, 2 = silné evropské ligy,
 * 3 = okolní ligy. Kupují za skutečné peníze, ale v simulaci nehrají.
 */
export const FOREIGN_CLUBS: { id: string; name: string; country: string; level: 1 | 2 | 3 | 4; region?: ScoutRegion }[] = [
  { id: 'westham', name: 'West Ham United', country: 'Anglie', level: 1 },
  { id: 'brentford', name: 'Brentford', country: 'Anglie', level: 1 },
  { id: 'leicester', name: 'Leicester City', country: 'Anglie', level: 1 },
  { id: 'hoffenheim', name: 'Hoffenheim', country: 'Německo', level: 1 },
  { id: 'freiburg', name: 'SC Freiburg', country: 'Německo', level: 1 },
  { id: 'mohuc', name: 'Mainz 05', country: 'Německo', level: 1 },
  { id: 'augsburg', name: 'FC Augsburg', country: 'Německo', level: 1 },
  { id: 'bologna', name: 'Bologna', country: 'Itálie', level: 1 },
  { id: 'fiorentina', name: 'Fiorentina', country: 'Itálie', level: 1 },
  { id: 'lens', name: 'RC Lens', country: 'Francie', level: 1 },
  { id: 'feyenoord', name: 'Feyenoord', country: 'Nizozemsko', level: 2 },
  { id: 'psv', name: 'PSV Eindhoven', country: 'Nizozemsko', level: 2 },
  { id: 'brugge', name: 'Club Brugge', country: 'Belgie', level: 2 },
  { id: 'anderlecht', name: 'Anderlecht', country: 'Belgie', level: 2 },
  { id: 'celtic', name: 'Celtic', country: 'Skotsko', level: 2 },
  { id: 'rangers', name: 'Rangers', country: 'Skotsko', level: 2 },
  { id: 'salcburk', name: 'RB Salcburk', country: 'Rakousko', level: 2 },
  { id: 'trabzonspor', name: 'Trabzonspor', country: 'Turecko', level: 2 },
  { id: 'olympiakos', name: 'Olympiakos', country: 'Řecko', level: 2 },
  { id: 'kodan', name: 'FC Kodaň', country: 'Dánsko', level: 2 },
  { id: 'ferencvaros', name: 'Ferencváros', country: 'Maďarsko', level: 3 },
  { id: 'legia', name: 'Legia Varšava', country: 'Polsko', level: 3 },
  { id: 'lech', name: 'Lech Poznaň', country: 'Polsko', level: 3 },
  { id: 'rakow', name: 'Raków Częstochowa', country: 'Polsko', level: 3 },
  { id: 'dinamo', name: 'Dinamo Záhřeb', country: 'Chorvatsko', level: 3 },
  { id: 'slovan', name: 'Slovan Bratislava', country: 'Slovensko', level: 3 },
  { id: 'rapid', name: 'Rapid Vídeň', country: 'Rakousko', level: 3 },
  { id: 'ludogorec', name: 'Ludogorec Razgrad', country: 'Bulharsko', level: 3 },
  // Úroveň 4: kluby, od kterých se hráči kupují přes zahraniční skauting (samy z české ligy nekupují).
  { id: 'dac', name: 'DAC Dunajská Streda', country: 'Slovensko', level: 4, region: 'okoli' },
  { id: 'trnava', name: 'Spartak Trnava', country: 'Slovensko', level: 4, region: 'okoli' },
  { id: 'zilina', name: 'MŠK Žilina', country: 'Slovensko', level: 4, region: 'okoli' },
  { id: 'gornik', name: 'Górnik Zabrze', country: 'Polsko', level: 4, region: 'okoli' },
  { id: 'jagiellonia', name: 'Jagiellonia Białystok', country: 'Polsko', level: 4, region: 'okoli' },
  { id: 'pogon', name: 'Pogoń Szczecin', country: 'Polsko', level: 4, region: 'okoli' },
  { id: 'hajduk', name: 'Hajduk Split', country: 'Chorvatsko', level: 4, region: 'balkan' },
  { id: 'zvezda', name: 'Crvena zvezda', country: 'Srbsko', level: 4, region: 'balkan' },
  { id: 'partizan', name: 'Partizan Bělehrad', country: 'Srbsko', level: 4, region: 'balkan' },
  { id: 'sarajevo', name: 'FK Sarajevo', country: 'Bosna a Hercegovina', level: 4, region: 'balkan' },
  { id: 'maribor', name: 'NK Maribor', country: 'Slovinsko', level: 4, region: 'balkan' },
  { id: 'cfr', name: 'CFR Kluž', country: 'Rumunsko', level: 4, region: 'balkan' },
  { id: 'midtjylland', name: 'FC Midtjylland', country: 'Dánsko', level: 4, region: 'sever' },
  { id: 'bodo', name: 'Bodø/Glimt', country: 'Norsko', level: 4, region: 'sever' },
  { id: 'molde', name: 'Molde FK', country: 'Norsko', level: 4, region: 'sever' },
  { id: 'malmo', name: 'Malmö FF', country: 'Švédsko', level: 4, region: 'sever' },
  { id: 'djurgarden', name: 'Djurgårdens IF', country: 'Švédsko', level: 4, region: 'sever' },
  { id: 'hjk', name: 'HJK Helsinky', country: 'Finsko', level: 4, region: 'sever' },
  { id: 'asec', name: 'ASEC Mimosas', country: 'Pobřeží slonoviny', level: 4, region: 'afrika' },
  { id: 'generation', name: 'Génération Foot', country: 'Senegal', level: 4, region: 'afrika' },
  { id: 'hearts', name: 'Hearts of Oak', country: 'Ghana', level: 4, region: 'afrika' },
  { id: 'enyimba', name: 'Enyimba', country: 'Nigérie', level: 4, region: 'afrika' },
  { id: 'wydad', name: 'Wydad Casablanca', country: 'Maroko', level: 4, region: 'afrika' },
  { id: 'mazembe', name: 'TP Mazembe', country: 'DR Kongo', level: 4, region: 'afrika' },
  { id: 'velez', name: 'Vélez Sarsfield', country: 'Argentina', level: 4, region: 'amerika' },
  { id: 'lanus', name: 'CA Lanús', country: 'Argentina', level: 4, region: 'amerika' },
  { id: 'danubio', name: 'Danubio', country: 'Uruguay', level: 4, region: 'amerika' },
  { id: 'idv', name: 'Independiente del Valle', country: 'Ekvádor', level: 4, region: 'amerika' },
  { id: 'nacional', name: 'Atlético Nacional', country: 'Kolumbie', level: 4, region: 'amerika' },
  { id: 'bragantino', name: 'RB Bragantino', country: 'Brazílie', level: 4, region: 'amerika' },
];

/** Země EU a EHP: hráči z nich nepotřebují pracovní povolení a nepočítají se do limitu cizinců. */
export const EU_COUNTRIES = new Set(['Česko', 'Slovensko', 'Polsko', 'Maďarsko', 'Chorvatsko', 'Slovinsko', 'Rumunsko', 'Bulharsko', 'Rakousko', 'Německo', 'Itálie', 'Francie', 'Nizozemsko', 'Belgie', 'Lucembursko', 'Dánsko', 'Švédsko', 'Finsko', 'Estonsko', 'Lotyšsko', 'Litva', 'Irsko', 'Španělsko', 'Portugalsko', 'Řecko', 'Kypr', 'Malta', 'Norsko', 'Island', 'Lichtenštejnsko', 'Švýcarsko']);

/** Jména podle regionů (aby hráč z Ghany nebo Argentiny nezněl česky). */
export const REGION_NAMES: Record<ScoutRegion, { first: string[]; last: string[] }> = {
  okoli: { first: ['Marek', 'Tomáš', 'Jakub', 'Patrik', 'Kacper', 'Bartosz', 'Michał', 'Dávid', 'Matúš', 'Szymon'], last: ['Kováč', 'Hrubý', 'Nowak', 'Kowalski', 'Wiśniewski', 'Bednár', 'Lewandowski', 'Šimko', 'Zieliński', 'Hamšík'] },
  balkan: { first: ['Luka', 'Marko', 'Nikola', 'Ivan', 'Stefan', 'Dino', 'Andrej', 'Mateo', 'Filip', 'Darko'], last: ['Petrović', 'Jovanović', 'Kovačić', 'Marić', 'Babić', 'Horvat', 'Popescu', 'Ilić', 'Hadžić', 'Novak'] },
  sever: { first: ['Erik', 'Mads', 'Oskar', 'Jonas', 'Lukas', 'Emil', 'Viktor', 'Elias', 'Aksel', 'Joel'], last: ['Hansen', 'Johansson', 'Nielsen', 'Larsen', 'Berg', 'Lindqvist', 'Virtanen', 'Andersen', 'Holm', 'Nyström'] },
  afrika: { first: ['Moussa', 'Kwame', 'Ibrahim', 'Samuel', 'Cheikh', 'Yaw', 'Emmanuel', 'Youssef', 'Ismaila', 'Victor'], last: ['Traoré', 'Mensah', 'Diallo', 'Okafor', 'Ndiaye', 'Koné', 'Boateng', 'Sarr', 'Mbemba', 'El Amrani'] },
  amerika: { first: ['Matías', 'Santiago', 'Lucas', 'Facundo', 'Juan', 'Gabriel', 'Nicolás', 'Thiago', 'Diego', 'Andrés'], last: ['González', 'Rodríguez', 'Fernández', 'Silva', 'Pereira', 'Gómez', 'Martínez', 'Cabrera', 'Ramírez', 'Santos'] },
  velke: { first: ['Oliver', 'Leon', 'Jamie', 'Lorenzo', 'Hugo', 'Noah', 'Finn', 'Mattia', 'Jules', 'Harvey'], last: ['Smith', 'Müller', 'Rossi', 'Dubois', 'Wright', 'Schneider', 'Bianchi', 'Martin', 'Walker', 'Fischer'] },
};
