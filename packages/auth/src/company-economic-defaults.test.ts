import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readCompanyEconomicDefaults,
  resolveDriverEconomics,
  SYSTEM_ECONOMIC_DEFAULTS,
} from "./company-economic-defaults.js";

describe("readCompanyEconomicDefaults", () => {
  it("reads percentages from company profile", () => {
    assert.deepEqual(
      readCompanyEconomicDefaults({
        defaultDriverSharePct: 40,
        defaultDriverBonusSharePct: 50,
        defaultDriverPlatformFeeSharePct: 0,
      }),
      {
        defaultDriverSharePct: 40,
        defaultDriverBonusSharePct: 50,
        defaultDriverPlatformFeeSharePct: 0,
      },
    );
  });
});

describe("resolveDriverEconomics", () => {
  const companyProfile = {
    defaultDriverSharePct: 40,
    defaultDriverBonusSharePct: 50,
    defaultDriverPlatformFeeSharePct: 0,
  };

  it("inherits company defaults when driver has no overrides", () => {
    assert.deepEqual(
      resolveDriverEconomics(
        {
          driverSharePct: null,
          driverBonusSharePct: null,
          driverPlatformFeeSharePct: null,
        },
        companyProfile,
      ),
      {
        driverSharePct: 40,
        driverBonusSharePct: 50,
        driverPlatformFeeSharePct: 0,
        dailyFixedCents: null,
      },
    );
  });

  it("uses driver overrides over company defaults", () => {
    assert.deepEqual(
      resolveDriverEconomics(
        {
          driverSharePct: 55,
          driverBonusSharePct: null,
          driverPlatformFeeSharePct: 10,
        },
        companyProfile,
      ),
      {
        driverSharePct: 55,
        driverBonusSharePct: 50,
        driverPlatformFeeSharePct: 10,
        dailyFixedCents: null,
      },
    );
  });

  it("falls back to system defaults when company and driver are empty", () => {
    assert.deepEqual(
      resolveDriverEconomics(
        {
          driverSharePct: null,
          driverBonusSharePct: null,
          driverPlatformFeeSharePct: null,
        },
        null,
      ),
      {
        driverSharePct: SYSTEM_ECONOMIC_DEFAULTS.driverSharePct,
        driverBonusSharePct: SYSTEM_ECONOMIC_DEFAULTS.driverBonusSharePct,
        driverPlatformFeeSharePct: SYSTEM_ECONOMIC_DEFAULTS.driverPlatformFeeSharePct,
        dailyFixedCents: null,
      },
    );
  });
});
