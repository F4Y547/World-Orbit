import type { CountryDef } from './types';

const r = (
  energy: number,
  food: number,
  metals: number,
  minerals: number,
  technology: number,
  strategic: number,
): Record<keyof CountryDef['resources'], number> => ({ energy, food, metals, minerals, technology, strategic });

export const COUNTRIES: CountryDef[] = [
  { id: 'usa', name: 'United States', code: 'us', accent: 0x4da3ff, tier: 0, power: 94, population: 340, resources: r(62, 88, 55, 48, 96, 95) },
  { id: 'china', name: 'China', code: 'cn', accent: 0xff5648, tier: 0, power: 91, population: 1410, resources: r(78, 82, 70, 88, 74, 82) },
  { id: 'russia', name: 'Russia', code: 'ru', accent: 0x9fb7e8, tier: 1, power: 83, population: 144, resources: r(92, 70, 72, 64, 38, 78) },
  { id: 'india', name: 'India', code: 'in', accent: 0xffa63e, tier: 1, power: 80, population: 1440, resources: r(55, 74, 58, 52, 44, 60) },
  { id: 'japan', name: 'Japan', code: 'jp', accent: 0xff8d85, tier: 1, power: 77, population: 124, resources: r(8, 38, 30, 22, 88, 55) },
  { id: 'germany', name: 'Germany', code: 'de', accent: 0xffd34d, tier: 1, power: 75, population: 84, resources: r(22, 42, 35, 28, 86, 60) },
  { id: 'uk', name: 'United Kingdom', code: 'gb', accent: 0x6f86ff, tier: 1, power: 73, population: 68, resources: r(38, 48, 28, 24, 80, 72) },
  { id: 'france', name: 'France', code: 'fr', accent: 0x7fd0ff, tier: 1, power: 72, population: 65, resources: r(30, 56, 30, 26, 78, 70) },
  { id: 'brazil', name: 'Brazil', code: 'br', accent: 0x3ecf74, tier: 2, power: 68, population: 215, resources: r(66, 90, 78, 62, 38, 50) },
  { id: 'skorea', name: 'South Korea', code: 'kr', accent: 0xb28dff, tier: 2, power: 66, population: 52, resources: r(12, 26, 24, 18, 84, 48) },
  { id: 'canada', name: 'Canada', code: 'ca', accent: 0xff6b81, tier: 2, power: 64, population: 39, resources: r(74, 72, 76, 44, 52, 45) },
  { id: 'australia', name: 'Australia', code: 'au', accent: 0x49c6e5, tier: 2, power: 62, population: 27, resources: r(68, 64, 86, 78, 40, 42) },
  { id: 'turkey', name: 'Turkey', code: 'tr', accent: 0xff7089, tier: 2, power: 61, population: 86, resources: r(34, 52, 40, 30, 40, 72) },
  { id: 'iran', name: 'Iran', code: 'ir', accent: 0x239f40, tier: 2, power: 63, population: 88, resources: r(92, 42, 36, 28, 48, 80) },
  { id: 'italy', name: 'Italy', code: 'it', accent: 0x40d9a3, tier: 2, power: 60, population: 59, resources: r(20, 44, 26, 20, 58, 55) },
  { id: 'mexico', name: 'Mexico', code: 'mx', accent: 0x8fe06a, tier: 2, power: 58, population: 128, resources: r(48, 58, 54, 40, 32, 52) },
  { id: 'indonesia', name: 'Indonesia', code: 'id', accent: 0xff8a5c, tier: 2, power: 57, population: 280, resources: r(62, 60, 52, 48, 26, 58) },
  { id: 'saudi', name: 'Saudi Arabia', code: 'sa', accent: 0x63e6b0, tier: 2, power: 56, population: 37, resources: r(97, 24, 20, 8, 30, 78) },
  { id: 'nigeria', name: 'Nigeria', code: 'ng', accent: 0x7ce8b8, tier: 2, power: 52, population: 225, resources: r(58, 44, 40, 42, 14, 30) },
  { id: 'argentina', name: 'Argentina', code: 'ar', accent: 0x8ad8f0, tier: 2, power: 51, population: 46, resources: r(52, 88, 56, 44, 28, 40) },
  { id: 'egypt', name: 'Egypt', code: 'eg', accent: 0xe8c76a, tier: 2, power: 50, population: 112, resources: r(26, 30, 18, 12, 22, 76) },
];
