import { BarrierState } from '../../../protocol/constants';
import { ScenarioRunner } from '../runner';
import { SCENARIOS, findScenario } from '../scenarios';
import type { ScenarioCtx, StepResult } from '../types';

jest.useFakeTimers();

/** run a promise while advancing fake timers */
async function drive<T>(p: Promise<T>, stepMs = 10, maxMs = 300_000): Promise<T> {
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
  for (let t = 0; t < maxMs && !done; t += stepMs) await jest.advanceTimersByTimeAsync(stepMs);
  if (!done) throw new Error('promise never settled');
  if (err) throw err;
  return val as T;
}

function describeFailures(id: string, i: number, r: StepResult | null) {
  if (!r) return `${id} step ${i + 1}: not run`;
  return `${id} step ${i + 1}: ${r.status}\n${r.checks
    .filter((c) => !c.ok)
    .map((c) => `  ${c.label}: expected ${c.expected}, got ${c.actual}`)
    .join('\n')}${r.error ? `\n  error: ${r.error}` : ''}`;
}

describe('presenter scenarios run end-to-end headless', () => {
  it('defines every scenario from DESIGN.md 3.3', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([
      'happy-path',
      'homing',
      'stop-mid-travel',
      'obstruction',
      'interlock-unsafe-sensor',
      'limit-conflict',
      'motion-timeout',
      'low-battery',
      'link-lost',
      'replayed-command',
      'guard-rejects',
      'not-owner',
      'auth-latency',
    ]);
    expect(findScenario('nope')).toBeUndefined();
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s: every step meets its expected outcome',
    async (_id, sc) => {
      const runner = new ScenarioRunner(sc, { autoDelayMs: 0 });
      await drive(runner.start());
      expect(runner.getSnapshot().bootError).toBeNull();
      const failures: string[] = [];
      for (let i = 0; i < sc.steps.length; i++) {
        const r = await drive(runner.next());
        expect(r).not.toBeNull();
        expect(r!.checks.length).toBeGreaterThan(0);
        if (r!.status !== 'pass') failures.push(describeFailures(sc.id, i, r));
      }
      expect(failures).toEqual([]);
      expect(runner.finished).toBe(true);
      expect(runner.allPassed).toBe(true);
      runner.dispose();
    },
  );

  it('exercises every demoable FSM row of STATE_MACHINE.md', () => {
    const rows = new Set(SCENARIOS.flatMap((s) => s.steps.flatMap((st) => st.fsmRows)));
    // rows reachable from the phone UI + device events; 3, 4, 12, 13, 22, 23, 25, 30-34 are not demo scenarios
    for (const r of [1, 2, 5, 6, 7, 9, 10, 11, 14, 15, 16, 18, 19, 20, 21, 24, 26, 27, 28, 29]) {
      expect(rows.has(r)).toBe(true);
    }
  });
});

describe('scenario specifics', () => {
  async function run(id: string) {
    const sc = findScenario(id)!;
    const runner = new ScenarioRunner(sc, { autoDelayMs: 0 });
    await drive(runner.start());
    const results: StepResult[] = [];
    while (!runner.finished) results.push((await drive(runner.next()))!);
    return { runner, results };
  }

  it('motion-timeout: fault arrives at the 7 s timer, measured', async () => {
    const { results, runner } = await run('motion-timeout');
    const ev = results[1]!.evidence.find((e) => e.label.startsWith('Time from ACCEPTED'));
    expect(ev).toBeDefined();
    const s = parseFloat(ev!.value);
    expect(s).toBeGreaterThanOrEqual(6.9);
    expect(s).toBeLessThanOrEqual(7.6);
    runner.dispose();
  });

  it('replayed-command: shows frame hex and the device reasons', async () => {
    const { results, runner } = await run('replayed-command');
    const hex = results[0]!.evidence.find((e) => e.mono)!.value;
    expect(hex).toMatch(/^01[0-9a-f]{16}$/); // RAISE opcode + 4 B counter + 4 B nonce
    expect(results[1]!.checks.map((c) => c.actual)).toContain('REPLAY');
    expect(results[2]!.checks.map((c) => c.actual)).toContain('COUNTER_JUMP');
    expect(results[4]!.checks.map((c) => c.actual)).toContain('BAD_NONCE');
    runner.dispose();
  });

  it('not-owner: unbonded phone is refused, then enrolled in the window', async () => {
    const { results, runner } = await run('not-owner');
    expect(results[0]!.checks[0]).toMatchObject({
      expected: 'NOT_AUTHORIZED',
      actual: 'NOT_AUTHORIZED',
      ok: true,
    });
    expect(runner.handle!.device.owners).toEqual(['this-phone']);
    runner.dispose();
  });

  it('auth-latency: collects N samples with p95 reported against the spec line', async () => {
    const { results, runner } = await run('auth-latency');
    expect(runner.getSnapshot().samples.length).toBe(1 + 20);
    expect(results[1]!.evidence.map((e) => e.label)).toContain('Against the spec line');
    runner.dispose();
  });

  it('auth-latency honours the configured distribution', async () => {
    const sc = findScenario('auth-latency')!;
    const runner = new ScenarioRunner(sc, {
      params: { connects: 6, latencyMedianMs: 2400, latencySigma: 0.1 },
    });
    await drive(runner.start());
    await drive(runner.next());
    await drive(runner.next());
    const samples = runner.getSnapshot().samples.slice(1);
    expect(samples).toHaveLength(6);
    expect(Math.min(...samples)).toBeGreaterThan(1500);
    runner.dispose();
  });

  it('a wrong expectation is reported as unexpected, not hidden', async () => {
    const sc = {
      ...findScenario('homing')!,
      steps: [
        {
          title: 'bad',
          narration: '',
          fsmRows: [],
          run: async (ctx: ScenarioCtx) => {
            ctx.check('forced', 'A', 'B');
          },
        },
      ],
    };
    const runner = new ScenarioRunner(sc, { autoDelayMs: 0 });
    await drive(runner.start());
    const r = await drive(runner.next());
    expect(r!.status).toBe('unexpected');
    runner.dispose();
  });
});

describe('runner controls', () => {
  it('Next reviews earlier results via Prev, then continues; Reset restores the start', async () => {
    const sc = findScenario('homing')!;
    const runner = new ScenarioRunner(sc, { autoDelayMs: 0 });
    await drive(runner.start());
    await drive(runner.next());
    await drive(runner.next());
    expect(runner.getSnapshot()).toMatchObject({ frontier: 2, view: 1 });
    runner.prev();
    expect(runner.getSnapshot().view).toBe(0);
    await drive(runner.next()); // review, not run
    expect(runner.getSnapshot()).toMatchObject({ frontier: 2, view: 1 });
    await drive(runner.next()); // runs step 3
    expect(runner.getSnapshot()).toMatchObject({ frontier: 3, view: 2 });
    expect(runner.finished).toBe(true);

    await drive(runner.reset());
    const snap = runner.getSnapshot();
    expect(snap).toMatchObject({ frontier: 0, view: 0, samples: expect.any(Array) });
    expect(snap.results.every((r) => r === null)).toBe(true);
    expect(snap.handle!.device.state).toBe(BarrierState.UNKNOWN);
    runner.dispose();
  });

  it('auto-play runs every step and stops at the end', async () => {
    const sc = findScenario('stop-mid-travel')!;
    const runner = new ScenarioRunner(sc, { autoDelayMs: 300 });
    await drive(runner.start());
    await drive(runner.autoPlay());
    expect(runner.finished).toBe(true);
    expect(runner.allPassed).toBe(true);
    expect(runner.getSnapshot().auto).toBe(false);
    runner.dispose();
  });

  it('auto-play halts on the first unexpected step', async () => {
    const base = findScenario('homing')!;
    const bad = {
      ...base,
      steps: [
        base.steps[0]!,
        {
          title: 'bad',
          narration: '',
          fsmRows: [],
          run: async (ctx: ScenarioCtx) => {
            ctx.check('forced', 'A', 'B');
          },
        },
        base.steps[1]!,
      ],
    };
    const runner = new ScenarioRunner(bad, { autoDelayMs: 0 });
    await drive(runner.start());
    await drive(runner.autoPlay());
    expect(runner.getSnapshot().frontier).toBe(2);
    expect(runner.allPassed).toBe(false);
    runner.dispose();
  });

  it('interlock toggles drive the device and read back', async () => {
    const runner = new ScenarioRunner(findScenario('stop-mid-travel')!, { autoDelayMs: 0 });
    await drive(runner.start());
    expect(runner.readInterlocks()).toEqual({
      zoneClear: true,
      sensorsValid: true,
      powerHealthy: true,
      link: true,
    });
    await drive(runner.setInterlock('zoneClear', false));
    await drive(runner.setInterlock('powerHealthy', false));
    await drive(runner.setInterlock('sensorsValid', false));
    expect(runner.readInterlocks()).toMatchObject({
      zoneClear: false,
      sensorsValid: false,
      powerHealthy: false,
    });
    await drive(runner.setInterlock('link', false));
    expect(runner.readInterlocks().link).toBe(false);
    await drive(runner.setInterlock('link', true));
    expect(runner.readInterlocks().link).toBe(true);
    runner.dispose();
  });
});
