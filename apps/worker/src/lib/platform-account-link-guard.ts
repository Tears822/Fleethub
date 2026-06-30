import { RidePlatform } from "@fleethub/db";

type DbTx = {
  driverPlatformAccount: {
    findFirst: (args: {
      where: {
        tenantId: string;
        platform: RidePlatform;
        externalDriverId?: string;
        driverId?: string;
      };
    }) => Promise<{ id: string; driverId: string; externalDriverId: string } | null>;
  };
};

/** Skip link when another driver already owns this platform external id. */
export async function externalDriverIdTakenByOther(
  tx: DbTx,
  tenantId: string,
  platform: RidePlatform,
  externalDriverId: string,
  driverId: string,
): Promise<boolean> {
  const ext = externalDriverId.trim();
  if (!ext) return false;
  const owner = await tx.driverPlatformAccount.findFirst({
    where: { tenantId, platform, externalDriverId: ext },
  });
  return Boolean(owner && owner.driverId !== driverId);
}
