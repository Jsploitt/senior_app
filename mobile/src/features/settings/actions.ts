/** Settings actions kept out of the UI so they are unit-testable. */
import { updateSettings } from '../../store/settings';
import { bleSupported, setTransportKind } from '../../store/transport';
import type { BarrierTransport, TransportKind } from '../../transport/types';

/**
 * Switch the active transport and persist it. Bluetooth is refused where unsupported (web).
 * setTransportKind disconnects and destroys the old transport first.
 */
export function chooseTransport(kind: TransportKind, supportsBle: boolean = bleSupported): boolean {
  if (kind === 'ble' && !supportsBle) return false;
  updateSettings({ transport: kind });
  setTransportKind(kind);
  return true;
}

/**
 * Forget the stored barrier: transport.forget clears the persisted counter (and disconnects),
 * then the remembered device name/id is cleared. The OS bond cannot be removed by the app.
 */
export async function forgetBarrier(
  transport: Pick<BarrierTransport, 'forget'>,
  deviceId: string | null,
): Promise<void> {
  if (deviceId) await transport.forget(deviceId);
  updateSettings({ lastDeviceId: null, lastDeviceName: null });
}

export const FORGET_INSTRUCTIONS =
  "Also remove M010-Barrier in your phone's Bluetooth settings (Settings > Connected devices > M010-Barrier > Forget). To use it again you must re-enroll: hold the barrier's button for 3 seconds.";
