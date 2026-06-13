export type TimeKey = `${number}-${1 | 2 | 3 | 4}-${1 | 2 | 3 | 4}`;

export interface ParsedTimeKey {
  year: number;
  pi: 1 | 2 | 3 | 4;
  sprint: 1 | 2 | 3 | 4;
}

const TIME_KEY_PATTERN = /^(\d{2})-([1-4])-([1-4])$/;

export function parseTimeKey(value: string): ParsedTimeKey {
  const match = TIME_KEY_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid time key: ${value}`);
  }

  return {
    year: Number(match[1]),
    pi: Number(match[2]) as 1 | 2 | 3 | 4,
    sprint: Number(match[3]) as 1 | 2 | 3 | 4,
  };
}

export function formatTimeKey(key: ParsedTimeKey): TimeKey {
  if (key.year < 0 || key.year > 99 || key.pi < 1 || key.pi > 4 || key.sprint < 1 || key.sprint > 4) {
    throw new Error(`Invalid time key parts: ${JSON.stringify(key)}`);
  }

  return `${String(key.year).padStart(2, "0")}-${key.pi}-${key.sprint}` as TimeKey;
}

export function toSprintIndex(key: TimeKey | string): number {
  const parsed = parseTimeKey(key);
  return parsed.year * 16 + (parsed.pi - 1) * 4 + (parsed.sprint - 1);
}

export function fromSprintIndex(index: number): TimeKey {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Invalid sprint index: ${index}`);
  }

  const year = Math.floor(index / 16);
  const withinYear = index % 16;
  const pi = Math.floor(withinYear / 4) + 1;
  const sprint = (withinYear % 4) + 1;

  return formatTimeKey({
    year,
    pi: pi as 1 | 2 | 3 | 4,
    sprint: sprint as 1 | 2 | 3 | 4,
  });
}

export function compareTimeKeys(a: TimeKey | string, b: TimeKey | string): -1 | 0 | 1 {
  const diff = toSprintIndex(a) - toSprintIndex(b);
  if (diff === 0) return 0;
  return diff < 0 ? -1 : 1;
}

export function sprintDurationInclusive(start: TimeKey, finish: TimeKey): number {
  const startIndex = toSprintIndex(start);
  const finishIndex = toSprintIndex(finish);
  if (finishIndex < startIndex) {
    throw new Error(`Finish ${finish} is before start ${start}`);
  }
  return finishIndex - startIndex + 1;
}

export function timelineBetween(start: TimeKey, finish: TimeKey): TimeKey[] {
  const startIndex = toSprintIndex(start);
  const finishIndex = toSprintIndex(finish);
  if (finishIndex < startIndex) {
    throw new Error(`Finish ${finish} is before start ${start}`);
  }

  return Array.from({ length: finishIndex - startIndex + 1 }, (_, offset) =>
    fromSprintIndex(startIndex + offset),
  );
}

export function shiftTimeKey(key: TimeKey, offset: number): TimeKey {
  return fromSprintIndex(toSprintIndex(key) + offset);
}

export function clampTimeKey(key: TimeKey, min: TimeKey, max: TimeKey): TimeKey {
  const index = toSprintIndex(key);
  return fromSprintIndex(Math.min(Math.max(index, toSprintIndex(min)), toSprintIndex(max)));
}

export function getCalendarYearLabel(key: TimeKey): string {
  return `Calendar Year 20${String(parseTimeKey(key).year).padStart(2, "0")}`;
}

export function getFiscalYearLabel(key: TimeKey, fiscalYearStartMonth: number): string {
  const { year, pi } = parseTimeKey(key);
  const piStartMonth = (pi - 1) * 3 + 1;
  const fiscalStartYear = piStartMonth >= fiscalYearStartMonth ? year : year - 1;
  return `FY${String(fiscalStartYear).padStart(2, "0")}/${String(fiscalStartYear + 1).padStart(2, "0")}`;
}

export function getPiLabel(key: TimeKey): string {
  const { year, pi } = parseTimeKey(key);
  return `${String(year).padStart(2, "0")}-${pi}`;
}
