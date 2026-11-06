import assert from "node:assert/strict";
import test from "node:test";
import { devicesInUse, sameDeviceUse } from "../../src/features/device-use/deviceUse.ts";

test("devices in use are listed camera first", () => {
  assert.deepEqual(devicesInUse({ camera: [], microphone: [] }), []);
  assert.deepEqual(devicesInUse({ camera: [], microphone: ["Teams"] }), ["microphone"]);
  assert.deepEqual(devicesInUse({ camera: ["Zoom"], microphone: ["Zoom"] }), ["camera", "microphone"]);
});

test("unchanged readings compare equal so the island does not re-render", () => {
  assert.equal(sameDeviceUse({ camera: ["Zoom"], microphone: [] }, { camera: ["Zoom"], microphone: [] }), true);
  assert.equal(sameDeviceUse({ camera: ["Zoom"], microphone: [] }, { camera: [], microphone: ["Zoom"] }), false);
  assert.equal(sameDeviceUse({ camera: ["A", "B"], microphone: [] }, { camera: ["A"], microphone: [] }), false);
});
