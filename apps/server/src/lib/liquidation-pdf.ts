import PDFDocument from "pdfkit";
import type { ShiftLiquidationDocument } from "@fleethub/auth";
import { resolveLogoFilesystemPath } from "@fleethub/auth";
import type { Translator } from "@fleethub/i18n";
import { paymentPdfLabel } from "./export-labels.js";
import {
  formatDateTimeEs,
  formatDateTimeShortEs,
  formatEuroFromCents,
  formatTripInstantEs,
} from "./format-money.js";

type PdfColumn = { x: number; w: number; label: string };

function tripTableColumns(t: Translator): PdfColumn[] {
  return [
    { x: 48, w: 58, label: t("exports.pdf.tripStart") },
    { x: 110, w: 52, label: t("exports.meta.platform") },
    { x: 162, w: 92, label: t("exports.pdf.tariff") },
    { x: 250, w: 44, label: t("exports.pdf.payment") },
    { x: 294, w: 44, label: t("exports.pdf.net") },
    { x: 350, w: 36, label: t("exports.pdf.tip") },
    { x: 386, w: 36, label: t("exports.pdf.toll") },
    { x: 450, w: 22, label: t("exports.pdf.ok") },
  ];
}

function platformLabelPdf(platform: string): string {
  const p = platform.trim().toUpperCase();
  if (p === "FREENOW") return "FreeNow";
  if (p === "UBER") return "Uber";
  if (p === "BOLT") return "Bolt";
  if (p === "CABIFY") return "Cabify";
  return platform;
}

const TABLE_FONT_SIZE = 7.5;
const TABLE_ROW_GAP = 5;

function drawTableRow(
  pdf: InstanceType<typeof PDFDocument>,
  columns: PdfColumn[],
  y: number,
  cells: string[],
  bold = false,
): number {
  pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(TABLE_FONT_SIZE);
  let rowHeight = 11;
  for (let i = 0; i < cells.length; i++) {
    const col = columns[i]!;
    const h = pdf.heightOfString(cells[i] ?? "", { width: col.w, lineGap: 0 });
    if (h > rowHeight) rowHeight = h;
  }
  for (let i = 0; i < cells.length; i++) {
    const col = columns[i]!;
    pdf.text(cells[i] ?? "", col.x, y, { width: col.w, lineBreak: true, lineGap: 0 });
  }
  return y + rowHeight + TABLE_ROW_GAP;
}

function writePeriodBlock(
  pdf: InstanceType<typeof PDFDocument>,
  t: Translator,
  periodFrom: string | null,
  periodTo: string | null,
  timeZone: string,
): void {
  pdf.fontSize(10).font("Helvetica-Bold").text(t("exports.pdf.period"));
  pdf.font("Helvetica").fontSize(9);
  pdf.text(
    `${t("exports.pdf.from")}: ${periodFrom ? formatDateTimeShortEs(periodFrom, timeZone) : "—"}`,
  );
  pdf.text(
    `${t("exports.pdf.to")}: ${periodTo ? formatDateTimeShortEs(periodTo, timeZone) : "—"}`,
  );
}

export async function buildLiquidationPdfBuffer(
  doc: ShiftLiquidationDocument,
  t: Translator,
): Promise<Buffer> {
  const logoPath = await resolveLogoFilesystemPath(doc.companyLogoUrl);
  const columns = tripTableColumns(t);

  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    const { liquidation: liq } = doc;
    const timeZone = doc.tenantTimezone || "Europe/Madrid";

    let headerY = pdf.y;
    if (logoPath) {
      try {
        const logoW = 72;
        const logoX = (pdf.page.width - logoW) / 2;
        pdf.image(logoPath, logoX, headerY, { fit: [logoW, 48], align: "center", valign: "center" });
        headerY += 52;
        pdf.y = headerY;
      } catch {
        /* omit broken logo */
      }
    }

    pdf.fontSize(16).font("Helvetica-Bold").text(doc.companyLegalName, { align: "center" });
    if (doc.companyTaxId) {
      pdf.fontSize(9).font("Helvetica").text(`${t("exports.pdf.taxId")}: ${doc.companyTaxId}`, { align: "center" });
    }
    if (doc.companyContactLine) {
      pdf.fontSize(9).text(doc.companyContactLine, { align: "center" });
    }

    pdf.moveDown(0.8);
    pdf.fontSize(13).font("Helvetica-Bold").text(t("exports.pdf.shiftLiquidation"), { align: "center" });
    pdf.fontSize(10).font("Helvetica").text(doc.tenantName, { align: "center" });

    pdf.moveDown(1);
    pdf.fontSize(10).font("Helvetica-Bold").text(t("exports.pdf.driver"));
    pdf.font("Helvetica");
    pdf.text(doc.driverName);
    if (doc.driverLicense) {
      pdf.text(`${t("exports.pdf.license")}: ${doc.driverLicense}`);
    }

    pdf.moveDown(0.4);
    writePeriodBlock(pdf, t, liq.periodFrom, liq.periodTo, timeZone);

    pdf.moveDown(0.6);
    pdf.fontSize(10).font("Helvetica-Bold").text(t("exports.pdf.economicSummary"));
    pdf.font("Helvetica").fontSize(9);
    const summaryRows: [string, string][] = [
      [t("exports.pdf.tripsIncluded"), String(liq.tripCount)],
      [t("turnos.closeDialog.gross"), formatEuroFromCents(liq.grossCents)],
      [t("turnos.closeDialog.vat"), formatEuroFromCents(liq.vatCents)],
      [t("turnos.closeDialog.net"), formatEuroFromCents(liq.netCents)],
      [
        t("turnos.closeDialog.driverNet", { pct: liq.driverSharePct }),
        formatEuroFromCents(liq.driverNetCents),
      ],
      [t("turnos.closeDialog.companyNet"), formatEuroFromCents(liq.companyNetCents)],
      ...(liq.t3Cents > 0
        ? [[t("turnos.closeDialog.t3"), formatEuroFromCents(liq.t3Cents)] as [string, string]]
        : []),
      [t("turnos.closeDialog.platformBonus"), formatEuroFromCents(liq.bonusCents)],
      ...(liq.bonusCents > 0
        ? [
            [
              t("turnos.closeDialog.driverBonus", { pct: liq.driverBonusSharePct }),
              formatEuroFromCents(liq.driverBonusCents),
            ] as [string, string],
          ]
        : []),
      ...(liq.platformFeeCents > 0
        ? [
            [t("turnos.closeDialog.platformFee"), formatEuroFromCents(liq.platformFeeCents)] as [
              string,
              string,
            ],
            ...(liq.driverPlatformFeeCents > 0
              ? [
                  [
                    t("turnos.closeDialog.driverFee", { pct: liq.driverPlatformFeeSharePct }),
                    formatEuroFromCents(liq.driverPlatformFeeCents),
                  ] as [string, string],
                ]
              : []),
          ]
        : []),
      ...(liq.dailyFixedCents > 0
        ? [[t("turnos.closeDialog.dailyFixed"), formatEuroFromCents(liq.dailyFixedCents)] as [string, string]]
        : []),
      [t("turnos.closeDialog.cash"), formatEuroFromCents(liq.cashCents)],
      [t("turnos.closeDialog.tips"), formatEuroFromCents(liq.tipsCents)],
      [t("turnos.closeDialog.tolls"), formatEuroFromCents(liq.tollsCents)],
      [t("turnos.closeDialog.totalSettle"), formatEuroFromCents(liq.totalToSettleCents)],
    ];
    for (const [label, value] of summaryRows) {
      pdf.text(`${label}: ${value}`, { lineGap: 1 });
    }

    if (doc.note) {
      pdf.moveDown(0.4);
      pdf.fontSize(10).font("Helvetica-Bold").text(t("exports.pdf.note"));
      pdf.font("Helvetica").fontSize(9).text(doc.note);
    }

    pdf.moveDown(0.8);
    pdf.font("Helvetica-Bold").fontSize(9).text(t("exports.pdf.servicesDetail"));

    let y = drawTableRow(
      pdf,
      columns,
      pdf.y + 4,
      columns.map((c) => c.label),
      true,
    );

    for (const trip of doc.trips) {
      if (y > 700) {
        pdf.addPage();
        y = 48;
        y = drawTableRow(
          pdf,
          columns,
          y,
          columns.map((c) => c.label),
          true,
        );
      }
      y = drawTableRow(pdf, columns, y, [
        formatTripInstantEs(trip.startedAt, timeZone),
        platformLabelPdf(trip.platform),
        trip.fareType ?? "—",
        paymentPdfLabel(t, trip.paymentMethod),
        formatEuroFromCents(trip.netCents),
        formatEuroFromCents(trip.tipCents),
        formatEuroFromCents(trip.tollCents),
        trip.paymentValidated ? t("common.yes") : t("common.no"),
      ]);
    }

    pdf.moveDown(2);
    pdf.fontSize(8).fillColor("#666666");
    pdf.text(
      t("exports.pdf.footer", {
        ref: doc.referenceId,
        at: formatDateTimeEs(doc.generatedAt, timeZone),
      }),
      48,
      pdf.page.height - 48,
      { align: "center", width: pdf.page.width - 96 },
    );

    pdf.end();
  });
}
