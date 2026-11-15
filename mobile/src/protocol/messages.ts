/**
 * Plain-language text for every firmware value the UI can show.
 * Exhaustive by construction (Record<enum, ...>), so a new enum value fails tsc.
 */
import { BarrierState, CmdResult, FaultReason, GuardBit, GUARD_ALL_BITS } from './constants';

export interface Explanation {
  title: string;
  detail: string;
  action?: string;
}

export type Tone = 'neutral' | 'positive' | 'moving' | 'warning' | 'critical';

export const STATE_TEXT: Record<BarrierState, { label: string; detail: string; tone: Tone }> = {
  [BarrierState.UNKNOWN]: {
    label: 'Position unknown',
    detail: 'The arm has not confirmed its position yet. Lower it to home the barrier.',
    tone: 'warning',
  },
  [BarrierState.RAISED]: {
    label: 'Raised',
    detail: 'Arm is up. Your space is reserved.',
    tone: 'neutral',
  },
  [BarrierState.LOWERED]: {
    label: 'Lowered',
    detail: 'Arm is flat. You can drive in.',
    tone: 'positive',
  },
  [BarrierState.RAISING]: { label: 'Raising', detail: 'Arm is moving up.', tone: 'moving' },
  [BarrierState.LOWERING]: { label: 'Lowering', detail: 'Arm is moving down.', tone: 'moving' },
  [BarrierState.STOPPED]: {
    label: 'Stopped',
    detail: 'Arm halted between positions. Raise or lower to continue.',
    tone: 'warning',
  },
  [BarrierState.FAULT]: {
    label: 'Fault',
    detail: 'The barrier locked itself for safety. It needs an on-site reset.',
    tone: 'critical',
  },
};

export const FAULT_TEXT: Record<FaultReason, Explanation> = {
  [FaultReason.NONE]: { title: 'No fault', detail: 'The barrier reports no fault.' },
  [FaultReason.MOTION_TIMEOUT]: {
    title: 'Arm did not finish moving',
    detail: 'The end position was not reached within 7 seconds, so the motor was stopped.',
    action: 'Check for something blocking the arm, then hold the unit button to clear the fault.',
  },
  [FaultReason.LIMIT_CONFLICT]: {
    title: 'Position sensors disagree',
    detail: 'The wrong end-limit switch fired, or both fired at once.',
    action: 'Inspect the limit switches, then clear the fault on the unit.',
  },
  [FaultReason.SENSOR_PERSISTENT]: {
    title: 'Sensor not responding',
    detail: 'A safety sensor has been invalid for too long.',
    action: 'Check the sensor wiring, then clear the fault on the unit.',
  },
  [FaultReason.POWER_CRITICAL]: {
    title: 'Battery critically low',
    detail: 'Battery voltage is too low to move the arm safely.',
    action: 'Let the solar panel recharge the battery, then clear the fault on the unit.',
  },
  [FaultReason.INTERNAL]: {
    title: 'Internal error',
    detail: 'The controller detected an internal error and stopped.',
    action: 'Power-cycle the unit. If it repeats, contact the installer.',
  },
};

export const GUARD_TEXT: Record<GuardBit, Explanation> = {
  [GuardBit.NOT_AUTHORIZED]: {
    title: 'Phone not authorized',
    detail: 'This connection is not a paired owner phone.',
    action: 'Pair this phone during the enrollment window.',
  },
  [GuardBit.STALE_COMMAND]: {
    title: 'Command was stale',
    detail: 'The command arrived too late or out of order.',
    action: 'Try again.',
  },
  [GuardBit.INVALID_POSITION]: {
    title: 'Not allowed from this position',
    detail: 'That move is not possible from where the arm is now.',
    action: 'Wait for the arm to stop, or choose the other direction.',
  },
  [GuardBit.SENSORS_INVALID]: {
    title: 'Sensors not ready',
    detail: 'A safety sensor reading is missing or invalid.',
    action: 'Wait a moment and try again.',
  },
  [GuardBit.ZONE_NOT_CLEAR]: {
    title: 'Something is in the way',
    detail: 'The obstruction sensor sees an object over the arm.',
    action: 'Clear the parking space and try again.',
  },
  [GuardBit.POWER_UNHEALTHY]: {
    title: 'Battery too low',
    detail: 'Battery voltage is below the safe level for motion.',
    action: 'Wait for the solar panel to recharge the battery.',
  },
  [GuardBit.FAULT_LATCHED]: {
    title: 'Fault is latched',
    detail: 'The barrier is in a fault state and refuses motion.',
    action: 'Clear the fault on the unit (hold the enrollment button).',
  },
};

export const RESULT_TEXT: Record<CmdResult, Explanation> = {
  [CmdResult.NONE]: { title: 'No command yet', detail: 'No command has been processed in this session.' },
  [CmdResult.ACCEPTED]: { title: 'Accepted', detail: 'The barrier started moving.' },
  [CmdResult.COMPLETED]: { title: 'Completed', detail: 'The arm reached its end position.' },
  [CmdResult.STOPPED]: { title: 'Stopped', detail: 'Motion was halted.' },
  [CmdResult.REJECTED_AUTH]: {
    title: 'Rejected: not authorized',
    detail: 'The barrier did not accept this phone or session.',
    action: 'Reconnect. If it repeats, re-pair during enrollment.',
  },
  [CmdResult.REJECTED_STALE]: {
    title: 'Rejected: out of sequence',
    detail: 'The command counter or timing did not match (replay protection).',
    action: 'The app resyncs automatically. Try again.',
  },
  [CmdResult.REJECTED_GUARD]: {
    title: 'Rejected by safety checks',
    detail: 'One or more safety conditions blocked the move.',
  },
  [CmdResult.REJECTED_FORMAT]: {
    title: 'Rejected: bad frame',
    detail: 'The barrier could not read the command.',
    action: 'Update the app.',
  },
  [CmdResult.FAULT]: { title: 'Fault', detail: 'The command ended in a fault.' },
};

export function guardBitsOf(mask: number): GuardBit[] {
  return GUARD_ALL_BITS.filter((b) => (mask & b) !== 0);
}

export function explainGuardMask(mask: number): Explanation[] {
  return guardBitsOf(mask).map((b) => GUARD_TEXT[b]);
}

export function formatBattery(mv: number): string {
  return `${(mv / 1000).toFixed(2)} V`;
}
