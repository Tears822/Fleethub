"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/shared/i18n/i18n-provider";

type Props = {
  uri: string;
  size?: number;
};

export function TotpQrCode({ uri, size = 200 }: Props) {
  const { t } = useTranslations();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setError(false);

    void import("qrcode").then((QRCode) =>
      QRCode.toDataURL(uri, {
        width: size,
        margin: 2,
        errorCorrectionLevel: "M",
      }),
    )
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [uri, size]);

  if (error) {
    return <p className="text-xs text-red-600">{t("account.totp.qrError")}</p>;
  }

  if (!dataUrl) {
    return (
      <div
        className="animate-pulse rounded-lg border border-zinc-200 bg-zinc-100"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt={t("account.totp.qrAlt")}
      width={size}
      height={size}
      className="rounded-lg border border-zinc-200 bg-white p-2"
    />
  );
}
