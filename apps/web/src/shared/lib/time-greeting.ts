/** IANA zone for tenant operators (Spain). Override in tests via `now` only. */
export const GREETING_TIME_ZONE = "Europe/Madrid";

/** Morning until 12:00, afternoon until 20:00, then night. */
export function getHourInTimeZone(date: Date, timeZone: string = GREETING_TIME_ZONE): number {
  const hourPart = new Intl.DateTimeFormat("es-ES", {
    hour: "numeric",
    hour12: false,
    timeZone,
  })
    .formatToParts(date)
    .find((p) => p.type === "hour");
  return hourPart ? Number.parseInt(hourPart.value, 10) : date.getHours();
}

export type TimeGreetingKey =
  | "shell.greeting.morning"
  | "shell.greeting.afternoon"
  | "shell.greeting.evening";

export function getTimeGreetingKey(
  now = new Date(),
  timeZone: string = GREETING_TIME_ZONE,
): TimeGreetingKey {
  const hour = getHourInTimeZone(now, timeZone);
  if (hour < 12) return "shell.greeting.morning";
  if (hour < 20) return "shell.greeting.afternoon";
  return "shell.greeting.evening";
}

/** @deprecated Prefer getTimeGreetingKey + translator in UI. */
export function getTimeGreeting(now = new Date(), timeZone: string = GREETING_TIME_ZONE): string {
  const key = getTimeGreetingKey(now, timeZone);
  const fallback: Record<TimeGreetingKey, string> = {
    "shell.greeting.morning": "Buenos días",
    "shell.greeting.afternoon": "Buenas tardes",
    "shell.greeting.evening": "Buenas noches",
  };
  return fallback[key];
}
