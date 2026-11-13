import json, glob, re, os, collections, sys

D = os.path.dirname(os.path.abspath(__file__))
raw = open(os.path.join(D, 'library_raw.json'), encoding='utf-8-sig').read()
lib = {r['id']: r for r in json.loads(raw[raw.index('{'):raw.rindex('}') + 1])['rows']}

CLASSES = {'4wd', 'passenger', 'light-commercial'}
FUELS = {'diesel', 'petrol', 'hybrid', 'electric'}
CONF = {'high', 'medium', 'low'}

results, problems = {}, []
PASS = sys.argv[1] if len(sys.argv) > 1 else ''
files = sorted(glob.glob(os.path.join(D, ('p2_' if PASS == 'p2' else '') + 'result_*.json')))
for f in files:
    try:
        rows = json.load(open(f, encoding='utf-8-sig'))
    except Exception as e:
        problems.append(f'{os.path.basename(f)}: invalid JSON ({e})')
        continue
    for r in rows:
        results[r.get('id')] = r

missing = [i for i in lib if i not in results]
unknown = [i for i in results if i not in lib]


def clean(text):
    if text is None:
        return None
    t = str(text).replace('—', ', ').replace('–', ' to ').replace(' - ', ', ').strip()
    return t or None


def year(v):
    try:
        v = int(v)
    except (TypeError, ValueError):
        return None
    return v if 1900 <= v <= 2027 else None


apply_rows, conflicts, rejected = [], [], collections.Counter()
extra = collections.defaultdict(list)
conf_count = collections.Counter()
for i, r in results.items():
    if i not in lib:
        continue
    h = lib[i]
    conf = r.get('confidence') if r.get('confidence') in CONF else 'low'
    conf_count[conf] += 1
    cls = r.get('vehicle_class') if r.get('vehicle_class') in CLASSES else None
    fuel = r.get('fuel_type') if r.get('fuel_type') in FUELS else None
    if r.get('vehicle_class') and cls is None: rejected['class'] += 1
    if r.get('fuel_type') and fuel is None: rejected['fuel'] += 1
    yf, yt = year(r.get('year_from')), year(r.get('year_to'))
    inprod = r.get('in_production') if isinstance(r.get('in_production'), bool) else None
    if yf and yt and yf > yt:
        rejected['year_order'] += 1
        yf = yt = None
    # The workshop's own vehicles are real. If it has seen older or newer ones, believe them within 3 years.
    hf, ht = year(h.get('hist_from')), year(h.get('hist_to'))
    if yf and hf and hf < yf:
        if yf - hf <= 3: yf = hf
        else:
            conflicts.append((h['make'], h['name'], f'research starts {yf}, workshop has seen {hf}')); extra[i].append(f'Researched Australian start was {yf}, but workshop records include vehicles from {hf} (earlier nameplate, grey imports or misfiled). Range widened to cover them.')
            yf = hf
    if yt and ht and ht > yt:
        if ht - yt <= 3: yt = ht
        else:
            conflicts.append((h['make'], h['name'], f'research ends {yt}, workshop has seen {ht}')); extra[i].append(f'Researched Australian end was {yt}, but workshop records include vehicles to {ht} (grey imports or misfiled). Range widened to cover them.')
            yt = ht
    if cls and h.get('hist_class') and cls != h['hist_class']:
        conflicts.append((h['make'], h['name'], f"class research {cls} vs history {h['hist_class']} ({h['vehicles']} vehicles)")); extra[i].append(f"Workshop job history suggested {h['hist_class']}.")
    if fuel and h.get('hist_fuel') and fuel != h['hist_fuel']:
        conflicts.append((h['make'], h['name'], f"fuel research {fuel} vs history {h['hist_fuel']} ({h['vehicles']} vehicles)")); extra[i].append(f"Workshop records suggested {h['hist_fuel']}.")

    sources = [s for s in (r.get('sources') or []) if isinstance(s, str) and re.match(r'^https?://', s)][:3]
    note = ' '.join(filter(None, [clean(r.get('notes')), ' '.join(extra[i]), f'Confidence: {conf}.', ('Sources: ' + ' '.join(sources)) if sources else None]))
    row = {'id': i, 'notes': note[:900]}
    if conf in ('high', 'medium'):
        row.update({
            'family': clean(r.get('family')), 'series': clean(r.get('series')),
            'year_from': yf, 'year_to': yt, 'in_production': inprod if inprod else None,
            'vehicle_class': cls, 'fuel_type': fuel, 'engine': clean(r.get('engine')),
        })
    if conf in ('high', 'medium'):
        apply_rows.append(row)

json.dump(apply_rows, open(os.path.join(D, 'apply_rows_p2.json' if PASS == 'p2' else 'apply_rows.json'), 'w', encoding='utf-8'))
print('result files', len(files), 'rows researched', len(results), 'of', len(lib))
print('missing', len(missing), 'unknown ids', len(unknown), 'problems', problems)
print('confidence', dict(conf_count), 'rejected values', dict(rejected))
print('conflicts', len(conflicts))
for c in conflicts[:60]:
    print('  ', c)
by = collections.Counter()
for r in apply_rows:
    for k in ('family', 'series', 'year_from', 'vehicle_class', 'fuel_type', 'engine'):
        if r.get(k) is not None: by[k] += 1
print('fields to set', dict(by))
