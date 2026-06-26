import type { FleetConnector } from "@fleethub/contracts";
import { RidePlatform } from "@fleethub/db";
import { boltConnector } from "./bolt.connector";
import { cabifyConnector } from "./cabify.connector";
import { freeNowConnector } from "./freenow.connector";
import { uberConnector } from "./uber.connector";

export function getFleetConnector(platform: RidePlatform): FleetConnector {
  switch (platform) {
    case RidePlatform.UBER:
      return uberConnector;
    case RidePlatform.FREENOW:
      return freeNowConnector;
    case RidePlatform.BOLT:
      return boltConnector;
    case RidePlatform.CABIFY:
      return cabifyConnector;
    default:
      throw new Error(`No FleetConnector registered for platform: ${platform}`);
  }
}
