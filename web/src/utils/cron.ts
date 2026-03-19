export function cronToTime(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 2) return '03:00';
  const min = parts[0].padStart(2, '0');
  const hr = parts[1].padStart(2, '0');
  return `${hr}:${min}`;
}

export function timeToCron(time: string): string {
  const [hr, min] = time.split(':');
  return `${parseInt(min, 10)} ${parseInt(hr, 10)} * * *`;
}
