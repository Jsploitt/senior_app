// Parking Barrier — real implementation of the "Parking Barrier.dc.html" prototype.
// Ported from the Claude Design canvas: same visuals/state machine, plain React (no dc-runtime).

const { useRef, useCallback, useEffect } = React;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Mirrors the mutable `this.state` / `this.setState` pattern the prototype's Component
// class relied on: `ref.current` is always the latest value (readable synchronously
// from inside timers), and calling setState schedules a re-render.
function useMergeState(initial) {
  const ref = useRef(initial);
  const [, forceRender] = React.useState(0);
  const setState = useCallback((update) => {
    const patch = typeof update === 'function' ? update(ref.current) : update;
    ref.current = { ...ref.current, ...patch };
    forceRender((n) => n + 1);
  }, []);
  return [ref, setState];
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function App() {
  const [s, setState] = useMergeState({
    screen: 'connect',
    ble: 'disconnected',
    authorized: true,
    areaClear: true,
    sensorsValid: true,
    powerHealthy: true,
    posFeedback: true,
    position: 'raised',
    armAngle: -78,
    stopReason: null,
    duration: 2200,
    log: [],
    presenterOpen: true,
  });

  const moveTimer = useRef(null);
  const animInterval = useRef(null);
  const scenarioTimers = useRef([]);

  const clearScenario = useCallback(() => {
    scenarioTimers.current.forEach(clearTimeout);
    scenarioTimers.current = [];
  }, []);

  useEffect(() => () => {
    clearTimeout(moveTimer.current);
    clearInterval(animInterval.current);
    clearScenario();
  }, [clearScenario]);

  const t = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    scenarioTimers.current.push(id);
    return id;
  }, []);

  const addLog = useCallback((text) => {
    setState((st) => ({ log: [{ id: Math.random(), text, time: timeNow() }, ...st.log].slice(0, 30) }));
  }, [setState]);

  // ---- connection ----
  const connect = useCallback(() => {
    if (s.current.ble !== 'disconnected') return;
    setState({ ble: 'connecting' });
    t(() => {
      setState({ ble: 'connected' });
      if (s.current.authorized) {
        addLog('Owner connected');
        setState({ screen: 'main' });
      }
    }, 900);
  }, [s, setState, t, addLog]);

  const reconnect = useCallback(() => setState({ screen: 'connect', ble: 'disconnected' }), [setState]);
  const goActivity = useCallback(() => setState({ screen: 'activity' }), [setState]);
  const goMain = useCallback(() => setState({ screen: 'main' }), [setState]);

  const toggleAuthorized = useCallback(() => {
    const v = !s.current.authorized;
    setState({ authorized: v });
    if (v && s.current.ble === 'connected' && s.current.screen === 'connect') {
      addLog('Owner connected');
      setState({ screen: 'main' });
    }
  }, [s, setState, addLog]);

  const toggleBle = useCallback(() => {
    if (s.current.ble === 'connected') {
      let { position, stopReason } = s.current;
      if (position === 'raising' || position === 'lowering') {
        clearInterval(animInterval.current);
        position = 'stopped'; stopReason = 'connection';
      }
      addLog('Bluetooth connection lost');
      setState({ ble: 'disconnected', position, stopReason });
    } else if (s.current.ble === 'disconnected') {
      setState({ ble: 'connected' });
      addLog('Owner connected');
    }
  }, [s, setState, addLog]);

  const stopFor = useCallback((reason, logText) => {
    clearInterval(animInterval.current);
    clearTimeout(moveTimer.current);
    setState({ position: 'stopped', stopReason: reason });
    if (logText) addLog(logText);
  }, [setState, addLog]);

  const toggleArea = useCallback(() => {
    const next = !s.current.areaClear;
    setState({ areaClear: next });
    if (!next && (s.current.position === 'raising' || s.current.position === 'lowering')) {
      stopFor('obstacle', 'Movement stopped — obstacle detected');
    }
  }, [s, setState, stopFor]);

  const toggleSensors = useCallback(() => setState({ sensorsValid: !s.current.sensorsValid }), [s, setState]);
  const togglePower = useCallback(() => setState({ powerHealthy: !s.current.powerHealthy }), [s, setState]);
  const togglePosFeedback = useCallback(() => setState({ posFeedback: !s.current.posFeedback }), [s, setState]);
  const togglePresenter = useCallback(() => setState({ presenterOpen: !s.current.presenterOpen }), [s, setState]);
  const onDurationChange = useCallback((e) => setState({ duration: parseInt(e.target.value, 10) }), [setState]);

  const triggerTimeout = useCallback(() => {
    if (s.current.position === 'raising' || s.current.position === 'lowering') {
      stopFor('timeout', 'Motion timeout');
    }
  }, [s, stopFor]);

  const canMoveNow = useCallback(() => {
    const st = s.current;
    return st.ble === 'connected' && st.authorized && !st.stopReason && st.areaClear && st.sensorsValid && st.powerHealthy && st.posFeedback &&
      (st.position === 'raised' || st.position === 'lowered' || st.position === 'stopped');
  }, [s]);

  const completeMove = useCallback((dir) => {
    const st = s.current;
    if (st.position !== 'raising' && st.position !== 'lowering') return;
    if (!st.areaClear) { stopFor('obstacle', 'Movement stopped — obstacle detected'); return; }
    if (!st.posFeedback) return; // waiting indefinitely for feedback
    const finalPos = dir === 'lower' ? 'lowered' : 'raised';
    setState({ position: finalPos, armAngle: dir === 'lower' ? 0 : -78 });
    addLog(dir === 'lower' ? 'Barrier lowered' : 'Barrier raised');
  }, [s, setState, addLog, stopFor]);

  const startMove = useCallback((dir) => {
    if (!canMoveNow()) return;
    addLog(dir === 'lower' ? 'Lower request accepted' : 'Raise request accepted');
    const toAngle = dir === 'lower' ? 0 : -78;
    const fromAngle = s.current.armAngle;
    const start = Date.now();
    const duration = s.current.duration;
    clearInterval(animInterval.current);
    setState({ position: dir === 'lower' ? 'lowering' : 'raising', stopReason: null });
    animInterval.current = setInterval(() => {
      const frac = Math.min(1, (Date.now() - start) / duration);
      setState({ armAngle: fromAngle + (toAngle - fromAngle) * frac });
      if (frac >= 1) clearInterval(animInterval.current);
    }, 40);
    clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => completeMove(dir), duration);
  }, [s, setState, addLog, canMoveNow, completeMove]);

  const doLower = useCallback(() => startMove('lower'), [startMove]);
  const doRaise = useCallback(() => startMove('raise'), [startMove]);

  const manualStop = useCallback(() => {
    if (s.current.ble !== 'connected') return;
    if (s.current.position !== 'raising' && s.current.position !== 'lowering') return;
    stopFor('manual', 'Movement stopped by owner');
  }, [s, stopFor]);

  const checkAgain = useCallback(() => {
    const st = s.current;
    const stillBlocked = st.ble !== 'connected' || !st.authorized || !st.areaClear || !st.sensorsValid || !st.powerHealthy;
    if (!stillBlocked) {
      setState({ stopReason: null });
      addLog('Fault cleared');
    }
  }, [s, setState, addLog]);

  const resetDemo = useCallback(() => {
    clearTimeout(moveTimer.current);
    clearInterval(animInterval.current);
    clearScenario();
    setState({
      screen: 'connect', ble: 'disconnected', authorized: true, areaClear: true,
      sensorsValid: true, powerHealthy: true, posFeedback: true,
      position: 'raised', armAngle: -78, stopReason: null, log: [],
    });
  }, [setState, clearScenario]);

  const scenario1 = useCallback(() => { // normal access
    resetDemo();
    t(() => connect(), 300);
    t(() => startMove('lower'), 1600);
  }, [resetDemo, t, connect, startMove]);

  const scenario2 = useCallback(() => { // reserve space
    resetDemo();
    const dur = s.current.duration;
    t(() => connect(), 300);
    t(() => startMove('lower'), 1600);
    t(() => startMove('raise'), 1600 + dur + 600);
  }, [resetDemo, s, t, connect, startMove]);

  const scenario3 = useCallback(() => { // obstacle during motion
    resetDemo();
    const dur = s.current.duration;
    t(() => connect(), 300);
    t(() => startMove('lower'), 1600);
    t(() => setState({ areaClear: false }), 1600 + Math.round(dur * 0.45));
    t(() => setState({ areaClear: true }), 1600 + Math.round(dur * 0.45) + 1300);
  }, [resetDemo, s, t, connect, startMove, setState]);

  const scenario4 = useCallback(() => { // unauthorized
    resetDemo();
    setState({ authorized: false });
    t(() => connect(), 300);
  }, [resetDemo, setState, t, connect]);

  const scenario5 = useCallback(() => { // connection lost
    resetDemo();
    const dur = s.current.duration;
    t(() => connect(), 300);
    t(() => startMove('lower'), 1600);
    t(() => toggleBle(), 1600 + dur + 500);
  }, [resetDemo, s, t, connect, startMove, toggleBle]);

  const scenario6 = useCallback(() => { // missing position feedback
    resetDemo();
    t(() => connect(), 300);
    t(() => setState({ posFeedback: false }), 1600);
    t(() => startMove('raise'), 2000);
  }, [resetDemo, t, connect, setState, startMove]);

  // ---------------- derived view values ----------------
  const st = s.current;
  const isConnect = st.screen === 'connect';
  const isMain = st.screen === 'main';
  const isActivity = st.screen === 'activity';

  const bleLabel = st.ble === 'connected' ? 'Connected' : st.ble === 'connecting' ? 'Connecting…' : 'Disconnected';
  const bleColor = st.ble === 'connected' ? '#087F5B' : st.ble === 'connecting' ? '#F59F00' : '#9AAAA5';
  const authLabel = st.authorized ? 'Owner authorized' : 'Not authorized';
  const authColor = st.authorized ? '#087F5B' : '#E03131';

  const positionMeta = {
    raised: ['Raised', 'Space reserved — vehicle access blocked.'],
    lowered: ['Lowered', 'Vehicle access enabled.'],
    raising: ['Raising…', 'Reserving the space.'],
    lowering: ['Lowering…', 'Enabling vehicle access.'],
    stopped: ['Stopped', 'Movement paused mid-travel.'],
  }[st.position] || ['—', ''];
  const positionLabel = positionMeta[0];
  let positionSub = positionMeta[1];
  let positionColor = '#172B26';
  if (st.position === 'raising' || st.position === 'lowering') positionColor = '#F59F00';
  if (st.position === 'stopped') positionColor = '#E03131';
  if (st.ble !== 'connected') positionSub += ' (last known)';

  const safetyLabel = !st.areaClear ? 'Obstacle detected' : !st.sensorsValid ? 'Sensor unavailable' : 'Area clear';
  const safetyColor = !st.areaClear || !st.sensorsValid ? '#E03131' : '#087F5B';
  const safetyBg = !st.areaClear || !st.sensorsValid ? '#FFF0EE' : '#EAF6F0';

  const blockers = [];
  if (st.ble !== 'connected') blockers.push('Phone not connected to barrier');
  if (st.authorized === false) blockers.push('Phone not authorized as owner');
  if (!st.areaClear) blockers.push('Obstacle detected in monitored area');
  if (!st.sensorsValid) blockers.push('Safety sensor unavailable');
  if (!st.powerHealthy) blockers.push('Power too low for movement');
  if (!st.posFeedback) blockers.push('Barrier position feedback unavailable');

  const idle = st.position === 'raised' || st.position === 'lowered';
  const canMove = canMoveNow();
  const showBlockers = idle && !canMove && blockers.length > 0;
  const showPrimary = idle;
  const primaryLabel = st.position === 'raised' ? 'Lower barrier' : 'Raise barrier';
  const primarySub = st.position === 'raised' ? 'Allow vehicle access' : 'Reserve parking space';
  const primaryAction = st.position === 'raised' ? doLower : doRaise;
  const primaryDisabled = !canMove;
  const primaryBg = canMove ? '#087F5B' : '#B9C4BF';

  const showBothActions = st.position === 'stopped' && !st.stopReason;
  const showStopReason = st.position === 'stopped' && !!st.stopReason;
  const stopReasonMap = {
    manual: ['Movement stopped by owner', 'You stopped the barrier mid-travel. Send a new command when ready.'],
    obstacle: ['Movement stopped — obstacle detected', 'The monitored area was not clear. Confirm the area is clear, then check again before sending a new command.'],
    timeout: ['Motion timeout', 'The barrier did not confirm its new position in time. Check conditions before trying again.'],
    connection: ['Connection lost during movement', 'Position is uncertain until you reconnect and send a new command.'],
  };
  const [stopReasonTitle, stopReasonBody] = stopReasonMap[st.stopReason] || ['', ''];

  const showStopControl = st.position === 'raising' || st.position === 'lowering';
  const stopDisabled = st.ble !== 'connected';

  const showDisconnectedBanner = isMain && st.ble !== 'connected';
  const showUnauthorizedBanner = isMain && st.ble === 'connected' && !st.authorized;

  const showConnectBtn = st.ble === 'disconnected' || st.ble === 'connecting';
  const connectDisabled = st.ble !== 'disconnected';
  const connectBtnLabel = st.ble === 'connecting' ? 'Connecting…' : 'Connect to barrier';
  const connectBtnOpacity = connectDisabled ? 0.6 : 1;
  const showUnauthorizedNotice = st.ble === 'connected' && !st.authorized;

  const durationLabel = (st.duration / 1000).toFixed(1) + 's';

  // ---------------- small building blocks ----------------

  function Dot({ color, size = 8 }) {
    return <span style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'inline-block' }} />;
  }

  function ToggleSwitch({ on, onClick, label }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#E4E9E7', whiteSpace: 'nowrap' }}>{label}</span>
        <button onClick={onClick} style={{
          width: 44, height: 26, borderRadius: 14, border: 'none', cursor: 'pointer',
          background: on ? '#087F5B' : '#DDE3E0', position: 'relative',
        }}>
          <span style={{
            position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20,
            borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
          }} />
        </button>
      </div>
    );
  }

  // ---------------- screens ----------------

  function ConnectScreen() {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 22px 28px', overflow: 'auto' }}>
        <div style={{ textAlign: 'center', padding: '8px 0 22px' }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>Parking Barrier</div>
          <div style={{ fontSize: 12, color: '#7C8B86', marginTop: 4 }}>Demo mode · Simulated device</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E7EAE8', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 1px 2px rgba(23,43,38,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EAF6F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M7 7l10 10-5 5V2l5 5L7 17" stroke="#087F5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>M010 Barrier</div>
              <div style={{ fontSize: 13, color: '#7C8B86' }}>Nearby device</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Dot color={bleColor} />
              <span style={{ fontSize: 13, fontWeight: 600, color: bleColor }}>{bleLabel}</span>
            </div>
          </div>

          {showConnectBtn && (
            <button onClick={connect} disabled={connectDisabled} style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#087F5B',
              color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', opacity: connectBtnOpacity,
            }}>{connectBtnLabel}</button>
          )}
        </div>

        {showUnauthorizedNotice && (
          <div style={{ marginTop: 16, background: '#FFF4E6', border: '1px solid #FFE0AA', borderRadius: 14, padding: 16, display: 'flex', gap: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flex: 'none', marginTop: 1 }}><path d="M12 9v4M12 17h.01M10.3 3.86L1.8 18a1.5 1.5 0 001.3 2.25h17.8a1.5 1.5 0 001.3-2.25L13.7 3.86a1.5 1.5 0 00-2.6 0z" stroke="#E8590C" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#8A4B00' }}>This phone is not authorized to control this barrier.</div>
              <div style={{ fontSize: 13, color: '#8A4B00', marginTop: 4, lineHeight: 1.4 }}>Only the enrolled owner phone can send commands. Pairing was simulated for this demo.</div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 18, fontSize: 12, color: '#9AAAA5', textAlign: 'center', lineHeight: 1.5 }}>Bluetooth Low Energy connects your phone to the barrier controller directly — no internet or cloud service is used.</div>
      </div>
    );
  }

  function MainScreen() {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 20px 22px', overflow: 'auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 2px 14px' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>M010 Barrier</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Dot color={bleColor} size={7} />
              <span style={{ fontSize: 12.5, color: bleColor, fontWeight: 600 }}>{bleLabel}</span>
              <span style={{ fontSize: 12.5, color: '#C7D0CC' }}>·</span>
              <span style={{ fontSize: 12.5, color: authColor, fontWeight: 600 }}>{authLabel}</span>
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: '#9AAAA5', background: '#EEF2F0', padding: '5px 9px', borderRadius: 20, fontWeight: 600, letterSpacing: 0.2 }}>DEMO</div>
        </div>

        {showDisconnectedBanner && (
          <button onClick={reconnect} style={{
            textAlign: 'left', border: 'none', cursor: 'pointer', background: '#F1F3F1', borderRadius: 12,
            padding: '11px 14px', marginBottom: 12, fontSize: 12.5, color: '#5B6B66', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', width: '100%',
          }}>
            <span>Phone disconnected — position shown is last known.</span>
            <span style={{ color: '#087F5B', fontWeight: 700 }}>Reconnect ›</span>
          </button>
        )}

        {showUnauthorizedBanner && (
          <div style={{ background: '#FFF4E6', border: '1px solid #FFE0AA', borderRadius: 12, padding: '12px 14px', marginBottom: 12, fontSize: 12.5, color: '#8A4B00', fontWeight: 600 }}>This phone is not authorized to control this barrier.</div>
        )}

        {/* illustration card */}
        <div style={{ background: '#fff', border: '1px solid #E7EAE8', borderRadius: 20, padding: '22px 18px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 1px 2px rgba(23,43,38,0.04)' }}>
          <svg width="100%" height="150" viewBox="0 0 300 170" style={{ maxWidth: 280 }}>
            <line x1="20" y1="150" x2="280" y2="150" stroke="#DCE3E0" strokeWidth="2" />
            <line x1="60" y1="150" x2="60" y2="30" stroke="#DCE3E0" strokeWidth="2" strokeDasharray="6 6" />
            <line x1="240" y1="150" x2="240" y2="30" stroke="#DCE3E0" strokeWidth="2" strokeDasharray="6 6" />
            <rect x="78" y="140" width="28" height="16" rx="3" fill="#DCE3E0" />
            <rect x="76" y="146" width="32" height="10" rx="4" fill="#B9C4BF" />
            <g transform={`rotate(${st.armAngle} 90 150)`}>
              <rect x="90" y="144" width="82" height="13" rx="6" fill="#087F5B" />
              <circle cx="172" cy="150.5" r="9" fill="#F59F00" />
            </g>
          </svg>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <Dot color={positionColor} size={10} />
            <span style={{ fontSize: 20, fontWeight: 700, color: positionColor }}>{positionLabel}</span>
          </div>
          <div style={{ fontSize: 12.5, color: '#7C8B86', marginTop: 4, textAlign: 'center' }}>{positionSub}</div>
        </div>

        {/* safety status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '10px 14px', background: safetyBg, borderRadius: 12 }}>
          <Dot color={safetyColor} />
          <span style={{ fontSize: 13, fontWeight: 600, color: safetyColor }}>{safetyLabel}</span>
        </div>

        {showStopReason && (
          <div style={{ marginTop: 12, background: '#FFF0EE', border: '1px solid #FFD3CC', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#C1121F' }}>{stopReasonTitle}</div>
            <div style={{ fontSize: 12.5, color: '#8A2E2E', marginTop: 4, lineHeight: 1.45 }}>{stopReasonBody}</div>
            <button onClick={checkAgain} style={{ marginTop: 10, padding: '9px 16px', borderRadius: 10, border: '1px solid #C1121F', background: '#fff', color: '#C1121F', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Check again</button>
          </div>
        )}

        {showBlockers && (
          <div style={{ marginTop: 12, background: '#F1F3F1', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#5B6B66', marginBottom: 6 }}>Can't move right now:</div>
            {blockers.map((b, i) => (
              <div key={i} style={{ fontSize: 12.5, color: '#5B6B66', padding: '2px 0' }}>• {b}</div>
            ))}
          </div>
        )}

        {showPrimary && (
          <button onClick={primaryAction} disabled={primaryDisabled} style={{
            marginTop: 16, width: '100%', padding: 16, borderRadius: 14, border: 'none', background: primaryBg,
            color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex',
            flexDirection: 'column', alignItems: 'center', gap: 2,
          }}>
            <span>{primaryLabel}</span>
            <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>{primarySub}</span>
          </button>
        )}

        {showBothActions && (
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button onClick={doLower} style={{ flex: 1, padding: '15px 8px', borderRadius: 14, border: 'none', background: '#087F5B', color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>Lower barrier</button>
            <button onClick={doRaise} style={{ flex: 1, padding: '15px 8px', borderRadius: 14, border: 'none', background: '#172B26', color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>Raise barrier</button>
          </div>
        )}

        {showStopControl && (
          <div>
            <button onClick={manualStop} disabled={stopDisabled} style={{
              marginTop: 16, width: '100%', padding: 16, borderRadius: 14, border: '2px solid #C1121F',
              background: '#fff', color: '#C1121F', fontSize: 16, fontWeight: 700, cursor: 'pointer',
              opacity: stopDisabled ? 0.5 : 1,
            }}>■ Stop movement</button>
            {stopDisabled && (
              <div style={{ fontSize: 12, color: '#9AAAA5', textAlign: 'center', marginTop: 8 }}>Phone can't send a stop request while disconnected. The barrier's local safety system keeps working on its own.</div>
            )}
          </div>
        )}

        <a href="#" onClick={(e) => { e.preventDefault(); goActivity(); }} style={{ display: 'block', textAlign: 'center', marginTop: 18, fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>Recent activity &amp; device details ›</a>

        <div style={{ marginTop: 'auto', paddingTop: 16, textAlign: 'center', fontSize: 11, color: '#B7C2BE' }}>Demo mode · Simulated device</div>
      </div>
    );
  }

  function ActivityScreen() {
    const logEmpty = st.log.length === 0;
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 20px 22px', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0 16px' }}>
          <button onClick={goMain} style={{ border: 'none', background: '#F1F3F1', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="9" height="15" viewBox="0 0 9 15" fill="none"><path d="M8 1L1 7.5L8 14" stroke="#172B26" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Activity &amp; device</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E7EAE8', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9AAAA5', letterSpacing: 0.4 }}>DEVICE DETAILS</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span style={{ color: '#7C8B86' }}>Device name</span><span style={{ fontWeight: 600 }}>M010 Barrier</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span style={{ color: '#7C8B86' }}>Controller</span><span style={{ fontWeight: 600 }}>ESP32-S3 (simulated)</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span style={{ color: '#7C8B86' }}>Connection</span><span style={{ fontWeight: 600, color: bleColor }}>{bleLabel}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span style={{ color: '#7C8B86' }}>Owner authorization</span><span style={{ fontWeight: 600, color: authColor }}>{authLabel}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}><span style={{ color: '#7C8B86' }}>Network</span><span style={{ fontWeight: 600 }}>Local BLE only</span></div>
        </div>

        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9AAAA5', letterSpacing: 0.4, margin: '18px 0 8px' }}>SIMULATED EVENTS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {st.log.map((item) => (
            <div key={item.id} style={{ background: '#fff', border: '1px solid #E7EAE8', borderRadius: 12, padding: '11px 14px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 13 }}>{item.text}</span>
              <span style={{ fontSize: 11.5, color: '#9AAAA5', flex: 'none' }}>{item.time}</span>
            </div>
          ))}
          {logEmpty && (
            <div style={{ fontSize: 13, color: '#9AAAA5', textAlign: 'center', padding: '20px 0' }}>No simulated events yet.</div>
          )}
        </div>

        <div style={{ marginTop: 16, fontSize: 11.5, color: '#B7C2BE', lineHeight: 1.5 }}>Events above are simulated for this demo and are not measured performance data.</div>
      </div>
    );
  }

  function ScenarioButton({ onClick, children }) {
    return (
      <button onClick={onClick} style={{ textAlign: 'left', padding: '9px 10px', borderRadius: 8, border: '1px solid #3A4145', background: '#2A3134', color: '#fff', fontSize: 12.5, cursor: 'pointer' }}>{children}</button>
    );
  }

  function PresenterPanel() {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#20262A', fontFamily: FONT, color: '#fff' }}>
        <div style={{ height: 54, flex: 'none' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 20px 22px', overflow: 'auto' }}>
          <div onClick={togglePresenter} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 12, padding: '2px 2px 4px' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>Presenter controls</div>
            <span style={{ fontSize: 12, color: '#8A9490', flex: 'none' }}>{st.presenterOpen ? 'Hide ▾' : 'Show ▸'}</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#8A9490', marginTop: 4 }}>Not part of the app — drives the simulated controller for this demo.</div>

          {st.presenterOpen && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ToggleSwitch label="Phone authorized" on={st.authorized} onClick={toggleAuthorized} />
              <ToggleSwitch label="Bluetooth connected" on={st.ble === 'connected'} onClick={toggleBle} />
              <ToggleSwitch label="Area clear" on={st.areaClear} onClick={toggleArea} />
              <ToggleSwitch label="Sensors valid" on={st.sensorsValid} onClick={toggleSensors} />
              <ToggleSwitch label="Power healthy" on={st.powerHealthy} onClick={togglePower} />
              <ToggleSwitch label="Position feedback" on={st.posFeedback} onClick={togglePosFeedback} />

              <button onClick={triggerTimeout} style={{ marginTop: 6, padding: 10, borderRadius: 10, border: '1px solid #3A4145', background: '#2A3134', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>Trigger motion timeout</button>

              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#B7C0BC', marginBottom: 4 }}>
                  <span>Simulated movement duration</span><span>{durationLabel}</span>
                </div>
                <input type="range" min="1000" max="4000" step="100" value={st.duration} onChange={onDurationChange} style={{ width: '100%' }} />
              </div>

              <div style={{ height: 1, background: '#3A4145', margin: '6px 0' }} />

              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8A9490', letterSpacing: 0.4 }}>QUICK SCENARIOS</div>
              <ScenarioButton onClick={scenario1}>1 · Normal access</ScenarioButton>
              <ScenarioButton onClick={scenario2}>2 · Reserve space</ScenarioButton>
              <ScenarioButton onClick={scenario3}>3 · Obstacle during motion</ScenarioButton>
              <ScenarioButton onClick={scenario4}>4 · Unauthorized phone</ScenarioButton>
              <ScenarioButton onClick={scenario5}>5 · Connection lost</ScenarioButton>
              <ScenarioButton onClick={scenario6}>6 · Missing position feedback</ScenarioButton>

              <button onClick={resetDemo} style={{ marginTop: 8, padding: 11, borderRadius: 10, border: 'none', background: '#087F5B', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Reset demo</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const IOSDevice = window.IOSDevice;

  return (
    <div style={{ minHeight: '100vh', background: '#EDEFEC', display: 'flex', flexWrap: 'wrap', gap: 36, alignItems: 'flex-start', justifyContent: 'center', padding: 40, fontFamily: FONT }}>

      {/* PHONE */}
      <div style={{ position: 'relative' }}>
        <IOSDevice width={390} height={844}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F7F8FA', fontFamily: FONT, color: '#172B26' }}>
            <div style={{ height: 54, flex: 'none' }} />
            {isConnect && <ConnectScreen />}
            {isMain && <MainScreen />}
            {isActivity && <ActivityScreen />}
          </div>
        </IOSDevice>
      </div>

      {/* PRESENTER PANEL */}
      <div style={{ position: 'relative' }}>
        <IOSDevice width={390} height={844} dark>
          <PresenterPanel />
        </IOSDevice>
      </div>

    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
