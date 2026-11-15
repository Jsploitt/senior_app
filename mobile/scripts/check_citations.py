"""Gate: every path:line citation in CONTRACT.md / STATE_MACHINE.md resolves in the firmware repo,
and key contract values appear at (or within 3 lines of) their cited line."""
import re, sys, os
FW = sys.argv[1]; docs = sys.argv[2:]
ALIASES = {'INTERFACES.md': 'docs/INTERFACES.md', 'ARCHITECTURE.md': 'docs/ARCHITECTURE.md',
           'barrier_types.h': 'firmware/components/barrier_types/include/barrier_types.h',
           'app_config.h': 'firmware/components/barrier_types/include/app_config.h',
           'main.c': 'firmware/main/main.c'}
cit = re.compile(r'`([A-Za-z0-9_./-]+\.(?:md|h|c|py|txt|defaults|csv|json|yml|yaml|cmake))((?::\d+(?:-\d+)?)+)`|`:(\d+(?:-\d+)?)`')
lines_cache = {}
def load(p):
    if p not in lines_cache:
        with open(os.path.join(FW, p), encoding='utf-8', errors='replace') as f: lines_cache[p] = f.read().split('\n')
    return lines_cache[p]
def resolve(p):
    if os.path.exists(os.path.join(FW, p)): return p
    if p in ALIASES: return ALIASES[p]
    hits = [os.path.relpath(os.path.join(r, f), FW).replace(os.sep, "/") for r,_,fs in os.walk(FW) for f in fs if f == os.path.basename(p) and ".git" not in r]
    return hits[0] if len(hits) == 1 else None
bad = []; total = 0
for d in docs:
    last = None
    for ln, line in enumerate(open(d, encoding='utf-8'), 1):
        for m in cit.finditer(line):
            if m.group(1):
                path = resolve(m.group(1)); last = path
                ranges = m.group(2).strip(':').split(':')
            else:
                path = last; ranges = [m.group(3)]
            if path is None:
                bad.append(f'{d}:{ln} unresolved path {m.group(0)}'); continue
            n = len(load(path))
            for r in ranges:
                a, *b = map(int, r.split('-')); b = b[0] if b else a
                total += 1
                if not (1 <= a <= b <= n): bad.append(f'{d}:{ln} {path}:{r} out of range (file has {n} lines)')
print(f'citations checked: {total}, failures: {len(bad)}')
for b in bad: print('  FAIL', b)
# value spot checks: (value, path, line)
checks = [('f5f61d53-97e4-4601-8204-81943dd7e865','docs/INTERFACES.md',16),('d6a1e91e-0067-4e39-b4b2-b9c0d3032d84','docs/INTERFACES.md',17),
 ('40bad457-f09d-43a8-8ccf-fe7cf09786a1','docs/INTERFACES.md',18),('1cd43f12-2ee3-472f-90c9-55907f75d50b','docs/INTERFACES.md',19),
 ('"M010-Barrier"','firmware/components/barrier_types/include/app_config.h',73),('CMD_COUNTER_WINDOW         64','firmware/components/barrier_types/include/app_config.h',65),
 ('CMD_MAX_AGE_MS             500','firmware/components/barrier_types/include/app_config.h',66),('MOTION_TIMEOUT_MS          7000','firmware/components/barrier_types/include/app_config.h',52),
 ('ENROLL_WINDOW_MS           60000','firmware/components/barrier_types/include/app_config.h',69),('ENROLL_BUTTON_HOLD_MS      3000','firmware/components/barrier_types/include/app_config.h',70),
 ('"<BII"','tools/ble_client.py',79),('"<BBBBBBHI"','tools/ble_client.py',84),('CMD_FRAME_LEN 9u','firmware/components/barrier_types/include/barrier_types.h',44)]
vbad = 0
for v,p,l in checks:
    ok = any(v in x for x in load(p)[l-1:l])
    if not ok: vbad += 1; print('  VALUE FAIL', v, p, l)
print(f'value spot checks: {len(checks)}, failures: {vbad}')
