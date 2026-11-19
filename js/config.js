export const VERSION = '0.1.0';
export const APP_NAME = 'MyHub';
export const TOOLS = [
  { id: 'calculator', icon: '🧮', color: 'violet', title: 'calculator', description: 'calculatorDesc' },
  { id: 'clock', icon: '🌍', color: 'sky', title: 'clock', description: 'clockDesc' },
  { id: 'notes', icon: '📝', color: 'amber', title: 'notes', description: 'notesDesc' },
];
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'auto', language: 'bg', favourites: ['calculator', 'clock', 'notes'],
  timeZones: ['Europe/London', 'Europe/Sofia', 'Europe/Istanbul'],
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
