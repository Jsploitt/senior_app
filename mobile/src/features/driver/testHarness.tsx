/** Test-only helpers (not imported by app code). */
import { act } from '@testing-library/react-native';
import { BarrierState, Opcode } from '@/protocol/constants';
import { createSimTransport, type SimTransportHandle } from '@/transport/SimTransport';

export const advance = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));

/** Run a promise to completion while stepping fake timers. */
export async function drive<T>(p: Promise<T>, stepMs = 10, maxMs = 60_000): Promise<T> {
  let done = false;
  let val: T | undefined;
  let err: unknown;
  p.then(
    (v) => {
      done = true;
      val = v;
    },
    (e) => {
      done = true;
      err = e;
    },
  );
  for (let t = 0; t < maxMs && !done; t += stepMs) await advance(stepMs);
  if (!done) throw new Error('promise never settled');
  if (err) throw err;
  return val as T;
}

export async function connectedSim(): Promise<SimTransportHandle> {
  const h = createSimTransport();
  await drive(h.transport.connect(h.device.id));
  return h;
}

/** Put a connected sim device into `target` and let the Status reach the client. */
export async function putInState(h: SimTransportHandle, target: BarrierState) {
  const { transport, device } = h;
  switch (target) {
    case BarrierState.LOWERED:
      break;
    case BarrierState.UNKNOWN:
      device.rebootBetweenLimits();
      break;
    case BarrierState.RAISED:
      await drive(transport.sendCommand(Opcode.RAISE));
      await advance(device.timings.travelMs + 500);
      break;
    case BarrierState.RAISING:
      await drive(transport.sendCommand(Opcode.RAISE));
      await advance(800);
      break;
    case BarrierState.LOWERING:
      await drive(transport.sendCommand(Opcode.RAISE));
      await advance(device.timings.travelMs + 500);
      await drive(transport.sendCommand(Opcode.LOWER));
      await advance(800);
      break;
    case BarrierState.STOPPED:
      await drive(transport.sendCommand(Opcode.RAISE));
      await advance(600);
      await drive(transport.sendCommand(Opcode.STOP));
      break;
    case BarrierState.FAULT:
      device.injectFault(1);
      break;
  }
  await advance(300);
}
