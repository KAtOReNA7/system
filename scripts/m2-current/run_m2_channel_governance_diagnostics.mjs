import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyM2CurrentChannelMaster,
  validateM2CurrentChannelMaster
} from "../../src/domain/m2Current/channelMaster.js";
import {
  forecastM2CurrentCanonicalChannelCase
} from "../../src/domain/m2Current/canonicalChannelModel.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = JSON.parse(await readFile(path.join(
  root,
  "test/fixtures/m2-current-channel-master.synthetic.v0.1.json"
), "utf8"));
if (
  fixture.schema
  !== "m2.current.channel_master.synthetic_fixture.v0.1"
) {
  throw new Error("m2_current_channel_fixture_schema_invalid");
}
const master = validateM2CurrentChannelMaster(fixture.channelMaster);
const mapped = applyM2CurrentChannelMaster(fixture.facts, master);
const forecast = forecastM2CurrentCanonicalChannelCase({
  horizonMonths: 3,
  canonicalChannels: [{
    channelRole: "terminal_sales_platform",
    revenueMode: "membership_subscription",
    historySeries: Array.from({ length: 18 }, () => 10)
  }]
});
const result = {
  schema: "m2.current.channel_governance_diagnostic.public.v0.1",
  status: "PASS",
  privateArtifactRequired: false,
  rawPairCount: master.rawPairCount,
  canonicalChannelCount: master.canonicalChannelCount,
  mapping: mapped.evidence,
  syntheticForecast: {
    pointEstimate: forecast.channelPointEstimate,
    singlePurchaseUnitConversionUsed:
      forecast.singlePurchaseUnitConversionUsed
  }
};
if (
  result.mapping.rowConserved !== true
  || result.mapping.amountConserved !== true
  || result.mapping.unmappedRowCount !== 0
  || result.syntheticForecast.pointEstimate !== 30
  || result.syntheticForecast.singlePurchaseUnitConversionUsed !== false
) {
  throw new Error("m2_current_channel_governance_diagnostic_failed");
}
if (!process.argv.includes("--verify")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
