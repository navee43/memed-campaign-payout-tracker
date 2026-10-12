/**
 * OPT-IN, TEST-ONLY shim. Enabled only when MEMED_TEST_LEGACY_MONGOD=1.
 *
 * The Node driver bundled with Mongoose 8 refuses servers older than MongoDB
 * 4.2 (wire version 8). In sandboxes where only a MongoDB 4.0 replica-set
 * binary is available (4.0 already supports multi-document transactions), this
 * lowers the driver's minimum wire version so the integration suite can run.
 * CI and normal local runs use a current MongoDB and never load this.
 * Must run before the driver's topology module is first imported.
 */
export function applyLegacyMongodShim(): void {
  if (process.env.MEMED_TEST_LEGACY_MONGOD !== "1") return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const constants = require("mongodb/lib/cmap/wire_protocol/constants") as { MIN_SUPPORTED_WIRE_VERSION: number };
  constants.MIN_SUPPORTED_WIRE_VERSION = 7;
}
