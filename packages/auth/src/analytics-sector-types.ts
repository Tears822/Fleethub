/** Tipos sector analítica (sin dependencias de servidor). */

export type SectorDriverAverages = {
  facturacion: number;
  comisiones: number;
  viajes: number;
  turnos: number;
  mediaTurno: number;
  eurHora: number;
  propinas: number;
  primas: number;
};

export type SectorPlatformFilter = "all" | "uber" | "freenow" | "bolt" | "cabify";
