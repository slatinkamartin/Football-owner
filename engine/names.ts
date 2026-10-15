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
export const FOREIGN_CLUBS: { id: string; name: string; country: string; level: 1 | 2 | 3 }[] = [
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
];
