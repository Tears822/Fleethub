import { shiftPlatformNameFromKey } from "@/features/shifts/lib/shift-platform";
import type {
  CerrarTurnosRow,
  PlatformKey,
  PlatformShiftMetrics,
  ShiftPlatformName,
  ShiftTableRow,
} from "@/features/shifts/ui/cerrar-turnos-types";

export type TripLine = {
  fechaHora: string;
  tarifa: string;
  tipoPago: string;
  /** Valor crudo de `paymentMethod` en BD (inferir modo de edición). */
  paymentMethod?: string | null;
  importe: string;
  /** Parte del importe con tarifa de taxímetro (importe − tarifa 3). */
  taximetro: string;
  t3: string;
  app: string;
  efectivo: string;
  tarjeta: string;
  comision: string;
  total: string;
  propinas: string;
  primas: string;
  peajes: string;
  /** Raw euros for Excel export (SUM-friendly). */
  importeNum?: number;
  taximetroNum?: number;
  t3Num?: number;
  appNum?: number;
  efectivoNum?: number;
  tarjetaNum?: number;
  comisionNum?: number;
  totalNum?: number;
  propinasNum?: number;
  primasNum?: number;
  peajesNum?: number;
  /** Tipo de pago sin confirmar en operativa. */
  pagoSinConfirmar?: boolean;
  /** App + efectivo + tarjeta no igualan el importe del viaje. */
  pagoDescuadrado?: boolean;
  tripId?: string;
  /** Neto del viaje en euros (edición mixto). */
  netCents?: number;
};

export type ShiftActivity = {
  viajesRealizados: number;
  horasConectado: string;
  eurHora: string;
  noAtendidos: number;
  rechazados: number;
  /** Origen de horas / no atendidos / rechazados. */
  source?: "platform" | "estimated";
};

export type PlatformBlock = {
  platform: ShiftPlatformName;
  viajes: number;
  trips: TripLine[];
  total: TripLine;
  /** IDs de viajes con `paymentValidated = false` (solo datos reales). */
  pendingPaymentTripIds?: string[];
  activity: ShiftActivity;
};

export type RowDetail = {
  fechaLabel: string;
  platforms: PlatformBlock[];
};

const JAVIER_UBER_TRIPS: TripLine[] = [
  {
    fechaHora: "15/03/2026 18:22",
    tarifa: "Tarifa 3",
    tipoPago: "App",
    importe: "18,50 €",
    taximetro: "0,00 €",
    t3: "18,50 €",
    app: "18,50 €",
    efectivo: "0,00 €",
    tarjeta: "0,00 €",
    comision: "-2,64 €",
    total: "15,86 €",
    propinas: "0,00 €",
    primas: "0,00 €",
    peajes: "0,00 €",
  },
  {
    fechaHora: "15/03/2026 21:05",
    tarifa: "Tarifa 3",
    tipoPago: "App",
    importe: "16,00 €",
    taximetro: "0,00 €",
    t3: "16,00 €",
    app: "16,00 €",
    efectivo: "0,00 €",
    tarjeta: "0,00 €",
    comision: "-2,28 €",
    total: "13,72 €",
    propinas: "0,00 €",
    primas: "0,00 €",
    peajes: "0,00 €",
  },
  {
    fechaHora: "16/03/2026 09:40",
    tarifa: "Tarifa 3",
    tipoPago: "App",
    importe: "14,98 €",
    taximetro: "0,00 €",
    t3: "14,98 €",
    app: "14,98 €",
    efectivo: "0,00 €",
    tarjeta: "0,00 €",
    comision: "-2,14 €",
    total: "12,84 €",
    propinas: "0,00 €",
    primas: "0,00 €",
    peajes: "0,00 €",
  },
];

const JAVIER_FN_TRIPS: TripLine[] = [
  {
    fechaHora: "15/03/2026 19:10",
    tarifa: "Tarifa 3",
    tipoPago: "App",
    importe: "17,00 €",
    taximetro: "0,00 €",
    t3: "17,00 €",
    app: "17,00 €",
    efectivo: "0,00 €",
    tarjeta: "0,00 €",
    comision: "-0,68 €",
    total: "16,32 €",
    propinas: "0,00 €",
    primas: "0,00 €",
    peajes: "0,00 €",
  },
  {
    fechaHora: "16/03/2026 11:15",
    tarifa: "Tarifa 3",
    tipoPago: "App",
    importe: "16,00 €",
    taximetro: "0,00 €",
    t3: "16,00 €",
    app: "16,00 €",
    efectivo: "0,00 €",
    tarjeta: "0,00 €",
    comision: "-0,64 €",
    total: "15,36 €",
    propinas: "0,00 €",
    primas: "0,00 €",
    peajes: "0,00 €",
  },
];

function sampleTrips(platform: ShiftPlatformName, count: number): TripLine[] {
  const base =
    platform === "FreeNow"
      ? [
          {
            fechaHora: "16/03/2026 08:12",
            tarifa: "Tarifa 3",
            tipoPago: "App",
            importe: "14,00 €",
            taximetro: "0,00 €",
            t3: "14,00 €",
            app: "14,00 €",
            efectivo: "0,00 €",
            tarjeta: "0,00 €",
            comision: "-0,56 €",
            total: "13,44 €",
            propinas: "0,00 €",
            primas: "0,00 €",
            peajes: "0,00 €",
          },
          {
            fechaHora: "16/03/2026 10:45",
            tarifa: "Tarifa 3",
            tipoPago: "App",
            importe: "16,00 €",
            taximetro: "0,00 €",
            t3: "16,00 €",
            app: "16,00 €",
            efectivo: "0,00 €",
            tarjeta: "0,00 €",
            comision: "-0,64 €",
            total: "15,36 €",
            propinas: "0,00 €",
            primas: "0,00 €",
            peajes: "0,00 €",
          },
        ]
      : [
          {
            fechaHora: "15/05/2026 09:05",
            tarifa: "UberX",
            tipoPago: "App",
            importe: "22,50 €",
            taximetro: "2,50 €",
            t3: "20,00 €",
            app: "22,50 €",
            efectivo: "0,00 €",
            tarjeta: "0,00 €",
            comision: "-4,50 €",
            total: "18,00 €",
            propinas: "2,50 €",
            primas: "0,00 €",
            peajes: "0,00 €",
          },
          {
            fechaHora: "15/05/2026 12:30",
            tarifa: "UberX",
            tipoPago: "Tarjeta",
            importe: "28,00 €",
            taximetro: "3,00 €",
            t3: "25,00 €",
            app: "28,00 €",
            efectivo: "0,00 €",
            tarjeta: "28,00 €",
            comision: "-5,60 €",
            total: "22,40 €",
            propinas: "0,00 €",
            primas: "3,00 €",
            peajes: "0,00 €",
          },
        ];

  return base.slice(0, Math.max(1, count));
}

function sumTrips(trips: TripLine[], label: string): TripLine {
  return {
    fechaHora: label,
    tarifa: "",
    tipoPago: "",
    importe: "—",
    taximetro: "—",
    t3: "—",
    app: "—",
    efectivo: "—",
    tarjeta: "—",
    comision: "-1,68 €",
    total: "40,32 €",
    propinas: "0,00 €",
    primas: "0,00 €",
    peajes: "0,00 €",
  };
}

function activityForPlatform(viajes: number, platform: ShiftPlatformName): ShiftActivity {
  const hours = Math.max(1, Math.round(viajes * 0.9));
  const mins = (viajes * 11) % 60;
  const eurBase = platform === "Uber" ? 16.5 : 14.2;
  return {
    viajesRealizados: viajes,
    horasConectado: `${hours}h ${mins}min`,
    eurHora: `${(eurBase + viajes * 0.3).toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} €`,
    noAtendidos: 0,
    rechazados: 0,
  };
}

function javierActivity(platform: ShiftPlatformName): ShiftActivity {
  if (platform === "Uber") {
    return {
      viajesRealizados: 3,
      horasConectado: "3h 20min",
      eurHora: "14,84 €",
      noAtendidos: 0,
      rechazados: 0,
    };
  }
  return {
    viajesRealizados: 2,
    horasConectado: "2h 10min",
    eurHora: "15,23 €",
    noAtendidos: 0,
    rechazados: 0,
  };
}

function isJavierRow(input: Pick<ShiftTableRow, "conductor" | "rango">): boolean {
  return (
    input.conductor === "Javier Gutierrez Santana" &&
    input.rango.includes("15/03/2026")
  );
}

function tripsForPlatform(
  input: Pick<ShiftTableRow, "conductor" | "rango" | "plataformas" | "viajes">,
  platform: ShiftPlatformName,
  viajes: number,
): TripLine[] {
  if (isJavierRow(input)) {
    return platform === "Uber" ? JAVIER_UBER_TRIPS : JAVIER_FN_TRIPS;
  }
  return sampleTrips(platform, Math.min(3, viajes));
}

function buildPlatformBlock(
  input: Pick<ShiftTableRow, "conductor" | "rango" | "plataformas" | "viajes">,
  platform: ShiftPlatformName,
  viajes: number,
): PlatformBlock {
  const trips = tripsForPlatform(input, platform, viajes);
  const totalLabel = `Total ${platform}`;
  return {
    platform,
    viajes,
    trips,
    total: sumTrips(trips, totalLabel),
    activity: isJavierRow(input) ? javierActivity(platform) : activityForPlatform(viajes, platform),
  };
}

export function getPlatformBreakdown(row: CerrarTurnosRow): PlatformShiftMetrics[] {
  if (row.desglose?.length) return row.desglose;

  if (row.plataformas !== "both" && row.plataformas !== "multi") {
    const platform: ShiftPlatformName =
      row.desglose?.[0]?.platform ?? shiftPlatformNameFromKey(row.plataformas);
    return [
      {
        platform,
        viajes: row.viajes,
        total: row.total,
        taximetro: row.taximetro,
        t3: row.t3,
        app: row.app,
        efectivo: row.efectivo,
        tarjetas: row.tarjetas,
        propinas: row.propinas,
        primas: row.primas,
        peajes: row.peajes,
        avisos: row.avisos,
      },
    ];
  }

  const uberCount = Math.ceil(row.viajes * 0.55);
  const fnCount = row.viajes - uberCount;
  return [
    {
      platform: "Uber",
      viajes: uberCount,
      total: row.total,
      taximetro: row.taximetro,
      t3: row.t3,
      app: row.app,
      efectivo: row.efectivo,
      tarjetas: row.tarjetas,
      propinas: row.propinas,
      primas: row.primas,
      peajes: row.peajes,
    },
    {
      platform: "FreeNow",
      viajes: fnCount,
      total: "0,00 €",
      taximetro: "0,00 €",
      t3: "0,00 €",
      app: "0,00 €",
      efectivo: "0,00 €",
      tarjetas: "0,00 €",
      propinas: "0,00 €",
      primas: "0,00 €",
      peajes: "0,00 €",
    },
  ];
}

function platformsForKey(
  input: Pick<ShiftTableRow, "conductor" | "rango" | "plataformas" | "viajes">,
  key: PlatformKey,
  viajes: number,
  desglose?: PlatformShiftMetrics[],
): PlatformBlock[] {
  if (key === "both" || key === "multi") {
    const uberCount = Math.ceil(viajes * 0.55);
    const fnCount = viajes - uberCount;
    const counts = desglose?.length
      ? desglose.map((d) => ({ platform: d.platform, viajes: d.viajes }))
      : [
          { platform: "Uber" as const, viajes: uberCount },
          { platform: "FreeNow" as const, viajes: fnCount },
        ];
    return counts.map(({ platform, viajes: count }) =>
      buildPlatformBlock(input, platform, count),
    );
  }

  const platform = shiftPlatformNameFromKey(key) as ShiftPlatformName;
  return [buildPlatformBlock(input, platform, viajes)];
}

export function getPlatformBlock(
  input: Pick<ShiftTableRow, "conductor" | "rango" | "plataformas" | "viajes">,
  platform: ShiftPlatformName,
  desglose?: PlatformShiftMetrics[],
): PlatformBlock | null {
  const blocks = platformsForKey(input, input.plataformas, input.viajes, desglose);
  return blocks.find((p) => p.platform === platform) ?? null;
}

export function getShiftRowDetail(
  input: Pick<ShiftTableRow, "plataformas" | "rango" | "viajes" | "conductor"> & {
    desglose?: PlatformShiftMetrics[];
  },
): RowDetail {
  const fechaLabel = input.rango.includes("–")
    ? input.rango.split("–").pop()?.trim() ?? input.rango
    : input.rango;

  return {
    fechaLabel,
    platforms: platformsForKey(
      input,
      input.plataformas,
      input.viajes,
      input.desglose,
    ),
  };
}

export const TRIP_DETAIL_HEADERS = [
  "Fecha / hora",
  "Tarifa",
  "Tipo de pago",
  "Importe",
  "Taxímetro",
  "Tarifa 3",
  "Pago app",
  "Efectivo",
  "Tarjeta",
  "Com. plataforma",
  "Total",
  "Propinas",
  "Primas",
  "Peajes",
] as const;

function parseEuroText(value: string): number {
  if (value === "—" || !value.trim()) return 0;
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function moneyNum(line: TripLine, display: string, num?: number): number {
  return num ?? parseEuroText(display);
}

export function tripLineToRow(line: TripLine): (string | number)[] {
  return [
    line.fechaHora,
    line.tarifa,
    line.tipoPago,
    moneyNum(line, line.importe, line.importeNum),
    moneyNum(line, line.taximetro, line.taximetroNum),
    moneyNum(line, line.t3, line.t3Num),
    moneyNum(line, line.app, line.appNum),
    moneyNum(line, line.efectivo, line.efectivoNum),
    moneyNum(line, line.tarjeta, line.tarjetaNum),
    moneyNum(line, line.comision, line.comisionNum),
    moneyNum(line, line.total, line.totalNum),
    moneyNum(line, line.propinas, line.propinasNum),
    moneyNum(line, line.primas, line.primasNum),
    moneyNum(line, line.peajes, line.peajesNum),
  ];
}

/** @deprecated Use getShiftRowDetail */
export const getCerrarTurnosRowDetail = getShiftRowDetail;
