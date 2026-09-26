// AK1 hello-world service UUID. Section 7.1 of MASTER_SPEC calls for ephemeral
// per-user tokens later (AK2); for now every dev build advertises under this
// one shared UUID so any two phones running the app can find each other.
export const BLE_SERVICE_UUID = '6e7a1b2c-9f3d-4a5e-8b6c-1d2e3f4a5b6c';

// iOS CoreBluetooth peripheral advertising only exposes local name + service
// UUIDs (MASTER_SPEC 7.1). Next to a 128-bit service UUID, iOS reportedly
// leaves ~8-10 bytes for the local name — verify this on real hardware and
// shorten AK1_LOCAL_NAME_PREFIX if the name gets truncated.
export const AK1_LOCAL_NAME_PREFIX = 'fc-';
