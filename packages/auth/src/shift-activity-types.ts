/** DTO actividad turno (sin dependencias de servidor). */

export type ShiftActivityDto = {
  viajesRealizados: number;
  horasConectado: string;
  eurHora: string;
  noAtendidos: number;
  rechazados: number;
  source: "platform" | "estimated";
};
