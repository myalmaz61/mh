export const VERSION = '2.0.0';
export const APP_NAME = 'MyHub';
export const TOOLS = [
  { id: 'calculator', icon: '🧮', color: 'violet', title: 'calculator', description: 'calculatorDesc' },
  { id: 'clock', icon: '🌍', color: 'sky', title: 'clock', description: 'clockDesc' },
  { id: 'notes', icon: '📝', color: 'amber', title: 'notes', description: 'notesDesc' },
  { id: 'weather', icon: '🌤️', color: 'sky', title: 'weather', description: 'weatherDesc' },
  { id: 'timer', icon: '⏱️', color: 'amber', title: 'timer', description: 'timerDesc' },
  { id: 'calendar', icon: '📅', color: 'violet', title: 'calendar', description: 'calendarDesc' },
  { id: 'tasks', icon: '✅', color: 'sky', title: 'tasks', description: 'tasksDesc' },
  { id: 'quicklist', icon: '☑️', color: 'amber', title: 'quickList', description: 'quickListDesc' },
  { id: 'football', icon: '⚽', color: 'sky', title: 'football', description: 'footballDesc' },
  { id: 'rss', icon: '📰', color: 'violet', title: 'rss', description: 'rssDesc' },
  { id: 'unit', icon: '📏', color: 'sky', title: 'unitConverter', description: 'unitConverterDesc' },
  { id: 'datecalc', icon: '📆', color: 'violet', title: 'dateCalculator', description: 'dateCalculatorDesc' },
  { id: 'percentage', icon: '％', color: 'amber', title: 'percentageCalculator', description: 'percentageCalculatorDesc' },
  { id: 'bookmarks', icon: '🔖', color: 'sky', title: 'bookmarks', description: 'bookmarksDesc' },
  { id: 'textcounter', icon: '🔤', color: 'violet', title: 'textCounter', description: 'textCounterDesc' },
  { id: 'random', icon: '🎲', color: 'amber', title: 'randomGenerator', description: 'randomGeneratorDesc' },
];
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'auto', language: 'bg', backupReminderDays:14, favourites: ['calculator', 'clock', 'notes'], hiddenTools: [], toolOrder: TOOLS.map(tool=>tool.id),
  timeZones: ['Europe/London', 'Europe/Sofia', 'Europe/Istanbul'],
  weatherCities: [{ id:'newport-shropshire-uk', name:'Newport', region:'Shropshire', country:'United Kingdom', latitude:52.7688, longitude:-2.3785 }],
  weatherSelectedId: 'newport-shropshire-uk',
});
export const CITIES = [
  { zone: 'Europe/London', bg: 'Лондон', en: 'London' },
  { zone: 'Europe/Sofia', bg: 'София', en: 'Sofia' },
  { zone: 'Europe/Istanbul', bg: 'Истанбул', en: 'Istanbul' },
  { zone: 'Europe/Paris', bg: 'Париж', en: 'Paris' },
  { zone: 'Europe/Berlin', bg: 'Берлин', en: 'Berlin' },
  { zone: 'Europe/Rome', bg: 'Рим', en: 'Rome' },
  { zone: 'America/New_York', bg: 'Ню Йорк', en: 'New York' },
  { zone: 'America/Los_Angeles', bg: 'Лос Анджелис', en: 'Los Angeles' },
  { zone: 'America/Toronto', bg: 'Торонто', en: 'Toronto' },
  { zone: 'Asia/Dubai', bg: 'Дубай', en: 'Dubai' },
  { zone: 'Asia/Tokyo', bg: 'Токио', en: 'Tokyo' },
  { zone: 'Asia/Kolkata', bg: 'Делхи', en: 'Delhi' },
  { zone: 'Asia/Singapore', bg: 'Сингапур', en: 'Singapore' },
  { zone: 'Australia/Sydney', bg: 'Сидни', en: 'Sydney' },
];
export const MAX_NOTES = 2000;
export const MAX_WEATHER_CITIES = 8;
