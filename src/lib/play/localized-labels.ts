type LocalizedLabel = { en: string; ru: string; kk: string };

// ── Occupations ───────────────────────────────────────────────────────────────

export const OCCUPATION_LABELS: Record<string, LocalizedLabel> = {
  "ACTOR":                    { en: "Actor",                     ru: "Актёр",                          kk: "Актер" },
  "POLITICIAN":               { en: "Politician",                ru: "Политик",                        kk: "Саясаткер" },
  "SINGER":                   { en: "Singer",                    ru: "Певец",                          kk: "Әнші" },
  "SOCCER PLAYER":            { en: "Soccer Player",             ru: "Футболист",                      kk: "Футболшы" },
  "WRITER":                   { en: "Writer",                    ru: "Писатель",                       kk: "Жазушы" },
  "MUSICIAN":                 { en: "Musician",                  ru: "Музыкант",                       kk: "Музыкант" },
  "RELIGIOUS FIGURE":         { en: "Religious Figure",          ru: "Религиозный деятель",            kk: "Діни тұлға" }, // REVIEW kk
  "FILM DIRECTOR":            { en: "Film Director",             ru: "Кинорежиссёр",                   kk: "Режиссер" },
  "BUSINESSPERSON":           { en: "Businessperson",            ru: "Предприниматель",                kk: "Кәсіпкер" },
  "MILITARY PERSONNEL":       { en: "Military Personnel",        ru: "Военный",                        kk: "Әскери қызметкер" },
  "PHILOSOPHER":              { en: "Philosopher",               ru: "Философ",                        kk: "Философ" },
  "EXTREMIST":                { en: "Extremist",                 ru: "Экстремист",                     kk: "Экстремист" },
  "NOBLEMAN":                 { en: "Nobleman",                  ru: "Аристократ",                     kk: "Аристократ" }, // REVIEW kk — дворянин/ақсүйек?
  "PAINTER":                  { en: "Painter",                   ru: "Живописец",                      kk: "Суретші" },
  "COMPOSER":                 { en: "Composer",                  ru: "Композитор",                     kk: "Композитор" },
  "SOCIAL ACTIVIST":          { en: "Social Activist",           ru: "Общественный активист",          kk: "Қоғам қайраткері" },
  "COMPANION":                { en: "Companion",                 ru: "Сподвижник",                     kk: "Сахаба" }, // REVIEW — чаще сподвижник пророка; может быть другой контекст
  "TENNIS PLAYER":            { en: "Tennis Player",             ru: "Теннисист",                      kk: "Теннисші" },
  "PHYSICIST":                { en: "Physicist",                 ru: "Физик",                          kk: "Физик" },
  "BASKETBALL PLAYER":        { en: "Basketball Player",         ru: "Баскетболист",                   kk: "Баскетболшы" },
  "COMEDIAN":                 { en: "Comedian",                  ru: "Комик",                          kk: "Комик" },
  "RACING DRIVER":            { en: "Racing Driver",             ru: "Автогонщик",                     kk: "Жарыс жүргізушісі" }, // REVIEW kk
  "MODEL":                    { en: "Model",                     ru: "Модель",                         kk: "Модель" },
  "WRESTLER":                 { en: "Wrestler",                  ru: "Борец",                          kk: "Балуан" }, // REVIEW — может быть рестлер (WWE) или борец (спорт)
  "BOXER":                    { en: "Boxer",                     ru: "Боксёр",                         kk: "Боксшы" },
  "MATHEMATICIAN":            { en: "Mathematician",             ru: "Математик",                      kk: "Математик" },
  "CELEBRITY":                { en: "Celebrity",                 ru: "Знаменитость",                   kk: "Атақты тұлға" }, // REVIEW kk
  "PRESENTER":                { en: "Presenter",                 ru: "Ведущий",                        kk: "Жүргізуші" },
  "MAFIOSO":                  { en: "Mafioso",                   ru: "Мафиози",                        kk: "Мафиози" }, // REVIEW kk
  "BASEBALL PLAYER":          { en: "Baseball Player",           ru: "Бейсболист",                     kk: "Бейсболшы" },
  "EXPLORER":                 { en: "Explorer",                  ru: "Исследователь",                  kk: "Зерттеуші" },
  "COACH":                    { en: "Coach",                     ru: "Тренер",                         kk: "Жаттықтырушы" },
  "MARTIAL ARTS":             { en: "Martial Artist",            ru: "Мастер боевых искусств",         kk: "Жекпе-жек шебері" }, // REVIEW — MARTIAL ARTS как occupation-лейбл, не жанр
  "AMERICAN FOOTBALL PLAYER": { en: "American Football Player",  ru: "Игрок в американский футбол",   kk: "Американдық футболшы" },
  "BIOLOGIST":                { en: "Biologist",                 ru: "Биолог",                         kk: "Биолог" },
  "SKATER":                   { en: "Skater",                    ru: "Фигурист",                       kk: "Фигурашы" }, // REVIEW — figure/speed/skateboard?
  "PORNOGRAPHIC ACTOR":       { en: "Adult Film Actor",          ru: "Актёр для взрослых",             kk: "Ересектерге арналған актер" },
  "INVENTOR":                 { en: "Inventor",                  ru: "Изобретатель",                   kk: "Өнертапқыш" },
  "PHYSICIAN":                { en: "Physician",                 ru: "Врач",                           kk: "Дәрігер" },
  "CRICKETER":                { en: "Cricketer",                 ru: "Крикетист",                      kk: "Крикетші" },
  "ATHLETE":                  { en: "Athlete",                   ru: "Спортсмен",                      kk: "Спортшы" },
  "HOCKEY PLAYER":            { en: "Hockey Player",             ru: "Хоккеист",                       kk: "Хоккейші" },
  "ARCHITECT":                { en: "Architect",                 ru: "Архитектор",                     kk: "Сәулетші" },
  "CHEMIST":                  { en: "Chemist",                   ru: "Химик",                          kk: "Химик" },
  "ASTRONAUT":                { en: "Astronaut",                 ru: "Космонавт",                      kk: "Ғарышкер" },
  "HISTORIAN":                { en: "Historian",                 ru: "Историк",                        kk: "Тарихшы" },
  "JOURNALIST":               { en: "Journalist",                ru: "Журналист",                      kk: "Журналист" },
  "DANCER":                   { en: "Dancer",                    ru: "Танцор",                         kk: "Биші" },
  "PSYCHOLOGIST":             { en: "Psychologist",              ru: "Психолог",                       kk: "Психолог" },
  "ASTRONOMER":               { en: "Astronomer",                ru: "Астроном",                       kk: "Астроном" },
  "ECONOMIST":                { en: "Economist",                 ru: "Экономист",                      kk: "Экономист" },
  "GOLFER":                   { en: "Golfer",                    ru: "Гольфист",                       kk: "Гольфші" }, // REVIEW kk
  "ARTIST":                   { en: "Artist",                    ru: "Художник",                       kk: "Суретші" }, // REVIEW — перекрывается с PAINTER
  "FASHION DESIGNER":         { en: "Fashion Designer",          ru: "Модельер",                       kk: "Сән дизайнері" }, // REVIEW kk
  "YOUTUBER":                 { en: "YouTuber",                  ru: "Ютубер",                         kk: "Ютубер" },
  "LAWYER":                   { en: "Lawyer",                    ru: "Юрист",                          kk: "Заңгер" },
  "PRODUCER":                 { en: "Producer",                  ru: "Продюсер",                       kk: "Продюсер" },
  "COMPUTER SCIENTIST":       { en: "Computer Scientist",        ru: "Информатик",                     kk: "Информатик" },
  "OCCULTIST":                { en: "Occultist",                 ru: "Оккультист",                     kk: "Оккультист" }, // REVIEW kk
  "ENGINEER":                 { en: "Engineer",                  ru: "Инженер",                        kk: "Инженер" },
  "CHESS PLAYER":             { en: "Chess Player",              ru: "Шахматист",                      kk: "Шахматшы" },
  "COMIC ARTIST":             { en: "Comic Artist",              ru: "Художник комиксов",              kk: "Комикс суретшісі" }, // REVIEW kk
  "DESIGNER":                 { en: "Designer",                  ru: "Дизайнер",                       kk: "Дизайнер" },
  "LINGUIST":                 { en: "Linguist",                  ru: "Лингвист",                       kk: "Тілтанушы" },
  "GAME DESIGNER":            { en: "Game Designer",             ru: "Геймдизайнер",                   kk: "Ойын дизайнері" }, // REVIEW kk
  "PUBLIC WORKER":            { en: "Public Servant",            ru: "Государственный деятель",        kk: "Мемлекет қайраткері" }, // REVIEW — civil servant / public servant / общественный работник?
  "PILOT":                    { en: "Pilot",                     ru: "Пилот",                          kk: "Ұшқыш" },
  "CYCLIST":                  { en: "Cyclist",                   ru: "Велосипедист",                   kk: "Велосипедші" },
  "GYMNAST":                  { en: "Gymnast",                   ru: "Гимнаст",                        kk: "Гимнаст" },
  "PIRATE":                   { en: "Pirate",                    ru: "Пират",                          kk: "Қарақшы" },
  "DIPLOMAT":                 { en: "Diplomat",                  ru: "Дипломат",                       kk: "Дипломат" },
  "SKIER":                    { en: "Skier",                     ru: "Лыжник",                         kk: "Лыжашы" },
  "JUDGE":                    { en: "Judge",                     ru: "Судья",                          kk: "Судья" }, // REVIEW kk — қазы (исторический) или судья?
  "MOUNTAINEER":              { en: "Mountaineer",               ru: "Альпинист",                      kk: "Альпинист" },
  "GEOGRAPHER":               { en: "Geographer",                ru: "Географ",                        kk: "Географ" },
  "GAMER":                    { en: "Gamer",                     ru: "Геймер",                         kk: "Геймер" },
  "INSPIRATION":              { en: "Inspirational Figure",      ru: "Вдохновляющая личность",         kk: "Үлгі тұлға" }, // REVIEW — странный occupation-лейбл, перевод условный
  "CHEF":                     { en: "Chef",                      ru: "Шеф-повар",                      kk: "Аспазші" },
  "ANTHROPOLOGIST":           { en: "Anthropologist",            ru: "Антрополог",                     kk: "Антрополог" },
  "MAGICIAN":                 { en: "Magician",                  ru: "Фокусник",                       kk: "Фокусник" }, // REVIEW kk — фокусник или маг/алдамшы?
  "SOCIOLOGIST":              { en: "Sociologist",               ru: "Социолог",                       kk: "Социолог" },
  "POLITICAL SCIENTIST":      { en: "Political Scientist",       ru: "Политолог",                      kk: "Саясаттанушы" },
  "SCULPTOR":                 { en: "Sculptor",                  ru: "Скульптор",                      kk: "Мүсінші" },
  "PHOTOGRAPHER":             { en: "Photographer",              ru: "Фотограф",                       kk: "Фотограф" },
  "SWIMMER":                  { en: "Swimmer",                   ru: "Пловец",                         kk: "Жүзуші" },
  "SNOOKER":                  { en: "Snooker Player",            ru: "Игрок в снукер",                 kk: "Снукерші" }, // REVIEW — лейбл "SNOOKER" без "PLAYER"
  "CRITIC":                   { en: "Critic",                    ru: "Критик",                         kk: "Сыншы" },
  "VOLLEYBALL PLAYER":        { en: "Volleyball Player",         ru: "Волейболист",                    kk: "Волейболшы" },
  "ARCHAEOLOGIST":            { en: "Archaeologist",             ru: "Археолог",                       kk: "Археолог" },
};

// ── Countries ─────────────────────────────────────────────────────────────────

export const COUNTRY_LABELS: Record<string, LocalizedLabel> = {
  "United States":                   { en: "United States",                   ru: "США",                               kk: "АҚШ" },
  "United Kingdom":                  { en: "United Kingdom",                  ru: "Великобритания",                    kk: "Ұлыбритания" },
  "Russia":                          { en: "Russia",                          ru: "Россия",                            kk: "Ресей" },
  "France":                          { en: "France",                          ru: "Франция",                           kk: "Франция" },
  "Germany":                         { en: "Germany",                         ru: "Германия",                          kk: "Германия" },
  "Italy":                           { en: "Italy",                           ru: "Италия",                            kk: "Италия" },
  "Japan":                           { en: "Japan",                           ru: "Япония",                            kk: "Жапония" },
  "China":                           { en: "China",                           ru: "Китай",                             kk: "Қытай" },
  "India":                           { en: "India",                           ru: "Индия",                             kk: "Үндістан" },
  "Spain":                           { en: "Spain",                           ru: "Испания",                           kk: "Испания" },
  "Canada":                          { en: "Canada",                          ru: "Канада",                            kk: "Канада" },
  "South Korea":                     { en: "South Korea",                     ru: "Южная Корея",                       kk: "Оңтүстік Корея" },
  "Ukraine":                         { en: "Ukraine",                         ru: "Украина",                           kk: "Украина" },
  "Kazakhstan":                      { en: "Kazakhstan",                      ru: "Казахстан",                         kk: "Қазақстан" },
  "Türkiye":                         { en: "Türkiye",                         ru: "Турция",                            kk: "Түркия" },
  "Brazil":                          { en: "Brazil",                          ru: "Бразилия",                          kk: "Бразилия" },
  "Greece":                          { en: "Greece",                          ru: "Греция",                            kk: "Грекия" }, // REVIEW kk — Греция или Грекия?
  "Australia":                       { en: "Australia",                       ru: "Австралия",                         kk: "Австралия" },
  "Austria":                         { en: "Austria",                         ru: "Австрия",                           kk: "Австрия" },
  "Netherlands":                     { en: "Netherlands",                     ru: "Нидерланды",                        kk: "Нидерланды" },
  "Sweden":                          { en: "Sweden",                          ru: "Швеция",                            kk: "Швеция" },
  "Egypt":                           { en: "Egypt",                           ru: "Египет",                            kk: "Египет" }, // REVIEW kk — официально Египет, традиционно Мысыр
  "Israel":                          { en: "Israel",                          ru: "Израиль",                           kk: "Израиль" },
  "Ireland":                         { en: "Ireland",                         ru: "Ирландия",                          kk: "Ирландия" },
  "Argentina":                       { en: "Argentina",                       ru: "Аргентина",                         kk: "Аргентина" },
  "Mexico":                          { en: "Mexico",                          ru: "Мексика",                           kk: "Мексика" },
  "Poland":                          { en: "Poland",                          ru: "Польша",                            kk: "Польша" },
  "Belgium":                         { en: "Belgium",                         ru: "Бельгия",                           kk: "Бельгия" },
  "Denmark":                         { en: "Denmark",                         ru: "Дания",                             kk: "Дания" },
  "Iran":                            { en: "Iran",                            ru: "Иран",                              kk: "Иран" },
  "Pakistan":                        { en: "Pakistan",                        ru: "Пакистан",                          kk: "Пәкістан" },
  "Saudi Arabia":                    { en: "Saudi Arabia",                    ru: "Саудовская Аравия",                 kk: "Сауд Арабиясы" },
  "Portugal":                        { en: "Portugal",                        ru: "Португалия",                        kk: "Португалия" },
  "Norway":                          { en: "Norway",                          ru: "Норвегия",                          kk: "Норвегия" },
  "Switzerland":                     { en: "Switzerland",                     ru: "Швейцария",                         kk: "Швейцария" },
  "Czechia":                         { en: "Czechia",                         ru: "Чехия",                             kk: "Чехия" },
  "Hungary":                         { en: "Hungary",                         ru: "Венгрия",                           kk: "Венгрия" },
  "Uzbekistan":                      { en: "Uzbekistan",                      ru: "Узбекистан",                        kk: "Өзбекстан" },
  "Colombia":                        { en: "Colombia",                        ru: "Колумбия",                          kk: "Колумбия" },
  "Puerto Rico":                     { en: "Puerto Rico",                     ru: "Пуэрто-Рико",                       kk: "Пуэрто-Рико" },
  "Serbia":                          { en: "Serbia",                          ru: "Сербия",                            kk: "Сербия" },
  "Iraq":                            { en: "Iraq",                            ru: "Ирак",                              kk: "Ирак" },
  "New Zealand":                     { en: "New Zealand",                     ru: "Новая Зеландия",                    kk: "Жаңа Зеландия" },
  "Georgia":                         { en: "Georgia",                         ru: "Грузия",                            kk: "Грузия" },
  "Taiwan":                          { en: "Taiwan",                          ru: "Тайвань",                           kk: "Тайвань" }, // REVIEW — политически чувствительно (КНР/Тайвань)
  "Lebanon":                         { en: "Lebanon",                         ru: "Ливан",                             kk: "Ливан" },
  "Mongolia":                        { en: "Mongolia",                        ru: "Монголия",                          kk: "Моңғолия" },
  "Chile":                           { en: "Chile",                           ru: "Чили",                              kk: "Чили" },
  "Cuba":                            { en: "Cuba",                            ru: "Куба",                              kk: "Куба" },
  "Hong Kong":                       { en: "Hong Kong",                       ru: "Гонконг",                           kk: "Гонконг" }, // REVIEW — политически чувствительно
  "Romania":                         { en: "Romania",                         ru: "Румыния",                           kk: "Румыния" },
  "Finland":                         { en: "Finland",                         ru: "Финляндия",                         kk: "Финляндия" },
  "Belarus":                         { en: "Belarus",                         ru: "Беларусь",                          kk: "Беларусь" }, // REVIEW ru — Беларусь (официально) или Белоруссия?
  "Philippines":                     { en: "Philippines",                     ru: "Филиппины",                         kk: "Филиппиндер" },
  "Bulgaria":                        { en: "Bulgaria",                        ru: "Болгария",                          kk: "Болгария" },
  "Nigeria":                         { en: "Nigeria",                         ru: "Нигерия",                           kk: "Нигерия" },
  "Morocco":                         { en: "Morocco",                         ru: "Марокко",                           kk: "Марокко" },
  "South Africa":                    { en: "South Africa",                    ru: "ЮАР",                               kk: "Оңтүстік Африка" },
  "Monaco":                          { en: "Monaco",                          ru: "Монако",                            kk: "Монако" },
  "Uruguay":                         { en: "Uruguay",                         ru: "Уругвай",                           kk: "Уругвай" },
  "Peru":                            { en: "Peru",                            ru: "Перу",                              kk: "Перу" },
  "Slovenia":                        { en: "Slovenia",                        ru: "Словения",                          kk: "Словения" },
  "North Korea":                     { en: "North Korea",                     ru: "Северная Корея",                    kk: "Солтүстік Корея" }, // REVIEW — политически чувствительно
  "Croatia":                         { en: "Croatia",                         ru: "Хорватия",                          kk: "Хорватия" },
  "Libya":                           { en: "Libya",                           ru: "Ливия",                             kk: "Ливия" },
  "United Arab Emirates":            { en: "United Arab Emirates",            ru: "ОАЭ",                               kk: "БАӘ" },
  "Azerbaijan":                      { en: "Azerbaijan",                      ru: "Азербайджан",                       kk: "Әзірбайжан" },
  "Kyrgyzstan":                      { en: "Kyrgyzstan",                      ru: "Кыргызстан",                        kk: "Қырғызстан" },
  "Venezuela":                       { en: "Venezuela",                       ru: "Венесуэла",                         kk: "Венесуэла" },
  "Algeria":                         { en: "Algeria",                         ru: "Алжир",                             kk: "Алжир" },
  "Senegal":                         { en: "Senegal",                         ru: "Сенегал",                           kk: "Сенегал" },
  "Vietnam":                         { en: "Vietnam",                         ru: "Вьетнам",                           kk: "Вьетнам" },
  "Afghanistan":                     { en: "Afghanistan",                     ru: "Афганистан",                        kk: "Ауғанстан" },
  "Armenia":                         { en: "Armenia",                         ru: "Армения",                           kk: "Армения" },
  "Turkmenistan":                    { en: "Turkmenistan",                    ru: "Туркменистан",                      kk: "Түрікменстан" },
  "Albania":                         { en: "Albania",                         ru: "Албания",                           kk: "Албания" },
  "Jamaica":                         { en: "Jamaica",                         ru: "Ямайка",                            kk: "Ямайка" },
  "Syria":                           { en: "Syria",                           ru: "Сирия",                             kk: "Сирия" },
  "North Macedonia":                 { en: "North Macedonia",                 ru: "Северная Македония",                kk: "Солтүстік Македония" }, // REVIEW — переименована в 2019
  "Tunisia":                         { en: "Tunisia",                         ru: "Тунис",                             kk: "Тунис" },
  "Isle of Man":                     { en: "Isle of Man",                     ru: "Остров Мэн",                        kk: "Мэн аралы" }, // REVIEW — British Crown dependency
  "Cameroon":                        { en: "Cameroon",                        ru: "Камерун",                           kk: "Камерун" },
  "Democratic Republic of the Congo":{ en: "DR Congo",                        ru: "ДР Конго",                          kk: "Конго ДР" }, // REVIEW kk — полное название?
  "Côte d'Ivoire":                   { en: "Côte d'Ivoire",                   ru: "Кот-д'Ивуар",                       kk: "Кот-д'Ивуар" }, // REVIEW kk
  "Estonia":                         { en: "Estonia",                         ru: "Эстония",                           kk: "Эстония" },
  "Kuwait":                          { en: "Kuwait",                          ru: "Кувейт",                            kk: "Кувейт" },
  "Jordan":                          { en: "Jordan",                          ru: "Иордания",                          kk: "Иордания" },
  "Bosnia and Herzegovina":          { en: "Bosnia and Herzegovina",          ru: "Босния и Герцеговина",              kk: "Босния және Герцеговина" }, // REVIEW kk
  "Indonesia":                       { en: "Indonesia",                       ru: "Индонезия",                         kk: "Индонезия" },
  "Ecuador":                         { en: "Ecuador",                         ru: "Эквадор",                           kk: "Эквадор" },
  "Kenya":                           { en: "Kenya",                           ru: "Кения",                             kk: "Кения" },
  "Thailand":                        { en: "Thailand",                        ru: "Таиланд",                           kk: "Таиланд" },
  "Burkina Faso":                    { en: "Burkina Faso",                    ru: "Буркина-Фасо",                      kk: "Буркина-Фасо" }, // REVIEW kk
  "Somalia":                         { en: "Somalia",                         ru: "Сомали",                            kk: "Сомали" },
  "Uganda":                          { en: "Uganda",                          ru: "Уганда",                            kk: "Уганда" },
  "Malaysia":                        { en: "Malaysia",                        ru: "Малайзия",                          kk: "Малайзия" },
  "Panama":                          { en: "Panama",                          ru: "Панама",                            kk: "Панама" },
  "Iceland":                         { en: "Iceland",                         ru: "Исландия",                          kk: "Исландия" },
  "Bermuda":                         { en: "Bermuda",                         ru: "Бермуды",                           kk: "Бермуды" }, // REVIEW — британская заморская территория
  "Singapore":                       { en: "Singapore",                       ru: "Сингапур",                          kk: "Сингапур" },
  "Myanmar (Burma)":                 { en: "Myanmar",                         ru: "Мьянма",                            kk: "Мьянма" }, // REVIEW — Myanmar (официально) vs Burma
  "Mali":                            { en: "Mali",                            ru: "Мали",                              kk: "Мали" },
  "Bangladesh":                      { en: "Bangladesh",                      ru: "Бангладеш",                         kk: "Бангладеш" },
  "Martinique":                      { en: "Martinique",                      ru: "Мартиника",                         kk: "Мартиника" }, // REVIEW — французская территория
  "Latvia":                          { en: "Latvia",                          ru: "Латвия",                            kk: "Латвия" },
  "Mozambique":                      { en: "Mozambique",                      ru: "Мозамбик",                          kk: "Мозамбик" },
  "Ghana":                           { en: "Ghana",                           ru: "Гана",                              kk: "Гана" },
  "Cyprus":                          { en: "Cyprus",                          ru: "Кипр",                              kk: "Кипр" },
  "Tanzania":                        { en: "Tanzania",                        ru: "Танзания",                          kk: "Танзания" },
  "Barbados":                        { en: "Barbados",                        ru: "Барбадос",                          kk: "Барбадос" },
  "Jersey":                          { en: "Jersey",                          ru: "Джерси",                            kk: "Джерси" }, // REVIEW — Crown dependency
  "Trinidad and Tobago":             { en: "Trinidad and Tobago",             ru: "Тринидад и Тобаго",                 kk: "Тринидад және Тобаго" }, // REVIEW kk
  "El Salvador":                     { en: "El Salvador",                     ru: "Сальвадор",                         kk: "Сальвадор" },
  "Nepal":                           { en: "Nepal",                           ru: "Непал",                             kk: "Непал" },
  "Saint Kitts and Nevis":           { en: "Saint Kitts and Nevis",           ru: "Сент-Китс и Невис",                 kk: "Сент-Китс және Невис" }, // REVIEW kk
  "Cambodia":                        { en: "Cambodia",                        ru: "Камбоджа",                          kk: "Камбоджа" },
  "Guatemala":                       { en: "Guatemala",                       ru: "Гватемала",                         kk: "Гватемала" },
  "American Samoa":                  { en: "American Samoa",                  ru: "Американское Самоа",                kk: "Американдық Самоа" }, // REVIEW kk
  "Oman":                            { en: "Oman",                            ru: "Оман",                              kk: "Оман" },
  "U.S. Virgin Islands":             { en: "U.S. Virgin Islands",             ru: "Виргинские острова (США)",          kk: "АҚШ Виргин аралдары" }, // REVIEW kk
  "Yemen":                           { en: "Yemen",                           ru: "Йемен",                             kk: "Йемен" },
  "Ethiopia":                        { en: "Ethiopia",                        ru: "Эфиопия",                           kk: "Эфиопия" },
  "Malta":                           { en: "Malta",                           ru: "Мальта",                            kk: "Мальта" },
  "Guinea-Bissau":                   { en: "Guinea-Bissau",                   ru: "Гвинея-Бисау",                      kk: "Гвинея-Бисау" }, // REVIEW kk
  "Saint Lucia":                     { en: "Saint Lucia",                     ru: "Сент-Люсия",                        kk: "Сент-Люсия" }, // REVIEW kk
  "Liberia":                         { en: "Liberia",                         ru: "Либерия",                           kk: "Либерия" },
  "Qatar":                           { en: "Qatar",                           ru: "Катар",                             kk: "Катар" },
  "Brunei":                          { en: "Brunei",                          ru: "Бруней",                            kk: "Бруней" },
  "Benin":                           { en: "Benin",                           ru: "Бенин",                             kk: "Бенин" },
  "Eswatini":                        { en: "Eswatini",                        ru: "Эсватини",                          kk: "Эсватини" }, // REVIEW — переименована из Свазиленд в 2018
  "Costa Rica":                      { en: "Costa Rica",                      ru: "Коста-Рика",                        kk: "Коста-Рика" },
  "Zimbabwe":                        { en: "Zimbabwe",                        ru: "Зимбабве",                          kk: "Зимбабве" },
  "Macao":                           { en: "Macao",                           ru: "Макао",                             kk: "Макао" }, // REVIEW — территория Китая
  "Guadeloupe":                      { en: "Guadeloupe",                      ru: "Гваделупа",                         kk: "Гваделупа" }, // REVIEW — французская территория
  "Nicaragua":                       { en: "Nicaragua",                       ru: "Никарагуа",                         kk: "Никарагуа" },
  "Rwanda":                          { en: "Rwanda",                          ru: "Руанда",                            kk: "Руанда" },
  "Luxembourg":                      { en: "Luxembourg",                      ru: "Люксембург",                        kk: "Люксембург" },
  "Dominican Republic":              { en: "Dominican Republic",              ru: "Доминиканская Республика",          kk: "Доминикан Республикасы" }, // REVIEW kk
  "Suriname":                        { en: "Suriname",                        ru: "Суринам",                           kk: "Суринам" },
  "Aruba":                           { en: "Aruba",                           ru: "Аруба",                             kk: "Аруба" }, // REVIEW — нидерландская территория
  "Tajikistan":                      { en: "Tajikistan",                      ru: "Таджикистан",                       kk: "Тәжікстан" },
  "Moldova":                         { en: "Moldova",                         ru: "Молдова",                           kk: "Молдова" },
  "Guyana":                          { en: "Guyana",                          ru: "Гайана",                            kk: "Гайана" },
};

// ── Sensitive occupations (UI may handle these specially) ─────────────────────

export const SENSITIVE_OCCUPATIONS: ReadonlySet<string> = new Set([
  "PORNOGRAPHIC ACTOR",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getOccupationLabel(
  value: string | null | undefined,
  locale: string,
): string {
  if (!value) return "";
  const label = OCCUPATION_LABELS[value];
  if (!label) return value;
  if (locale === "ru") return label.ru || label.en || value;
  if (locale === "kk") return label.kk || label.ru || label.en || value;
  return label.en || value;
}

export function getCountryLabel(
  value: string | null | undefined,
  locale: string,
): string {
  if (!value) return "";
  const label = COUNTRY_LABELS[value];
  if (!label) return value;
  if (locale === "ru") return label.ru || label.en || value;
  if (locale === "kk") return label.kk || label.ru || label.en || value;
  return label.en || value;
}
