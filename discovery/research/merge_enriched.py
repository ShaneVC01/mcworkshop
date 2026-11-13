import json, os, re, sys, collections

D = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1]
db = {r['id']: r for r in json.load(open(os.path.join(D, 'db_now.json'), encoding='utf-8'))}
rows = json.load(open(SRC, encoding='utf-8-sig'))

CLASSES = {'4wd', 'passenger', 'light-commercial'}
FUELS = {'diesel', 'petrol', 'hybrid', 'electric'}
CONF = {'high', 'medium', 'low'}
FIELDS = ['family', 'series', 'year_from', 'year_to', 'vehicle_class', 'fuel_type', 'engine']
LIMITS = {'family': 60, 'series': 120, 'engine': 400}

prob = collections.Counter()
examples = collections.defaultdict(list)


def bad(kind, r, detail=''):
    prob[kind] += 1
    if len(examples[kind]) < 5:
        examples[kind].append(f"{r.get('make')} {r.get('model')} {detail}".strip())


def clean(t):
    if t is None:
        return None
    t = str(t).replace('—', ', ').replace('–', ' to ').replace(' - ', ', ').strip()
    return t or None


def year(v):
    if v is None:
        return None
    try:
        v = int(v)
    except (TypeError, ValueError):
        return 'bad'
    return v if 1900 <= v <= 2027 else 'bad'


seen = set()
out, changes, overwrites = [], collections.Counter(), collections.Counter()
conf_count = collections.Counter()
ow_examples = collections.defaultdict(list)
skipped_manual = unknown = dup = 0
for r in rows:
    i = r.get('id')
    if i in seen:
        dup += 1
        continue
    seen.add(i)
    if i not in db:
        unknown += 1
        continue
    h = db[i]
    if r.get('make') != h['make'] or r.get('model') != h['model']:
        bad('make_model_changed', r, f"was {h['make']} {h['model']}")
    if h.get('data_source') == 'manual':
        skipped_manual += 1
        continue
    conf = r.get('confidence') if r.get('confidence') in CONF else 'low'
    conf_count[conf] += 1

    v = {}
    cls = r.get('vehicle_class')
    if cls is not None and cls not in CLASSES:
        bad('class_invalid', r, repr(cls)); cls = None
    fuel = r.get('fuel_type')
    if fuel is not None and fuel not in FUELS:
        bad('fuel_invalid', r, repr(fuel)); fuel = None
    yf, yt = year(r.get('year_from')), year(r.get('year_to'))
    if yf == 'bad': bad('year_from_invalid', r, repr(r.get('year_from'))); yf = None
    if yt == 'bad': bad('year_to_invalid', r, repr(r.get('year_to'))); yt = None
    inprod = r.get('in_production') if isinstance(r.get('in_production'), bool) else None
    if yf and yt and yf > yt:
        bad('year_order', r, f'{yf} > {yt}'); yf = yt = None
    if inprod and yt:
        # in production but with an end year: the end year wins only if it is in the past
        bad('inprod_with_year_to', r, f'{yt}')
    fam, ser, eng = clean(r.get('family')), clean(r.get('series')), clean(r.get('engine'))
    for k, val in (('family', fam), ('series', ser), ('engine', eng)):
        if val and len(val) > LIMITS[k]:
            bad(f'{k}_long', r, str(len(val)))
    v = {'family': fam, 'series': ser, 'year_from': yf, 'year_to': yt,
         'vehicle_class': cls, 'fuel_type': fuel, 'engine': eng}

    new_row = {'id': i}
    for k in FIELDS:
        nv = v[k]
        ov = h.get(k)
        if nv is None:
            continue
        if ov is None:
            changes[k + ' filled'] += 1
        elif nv != ov:
            changes[k + ' changed'] += 1
            overwrites[k] += 1
            if len(ow_examples[k]) < 6:
                ow_examples[k].append(f"{h['make']} {h['model']}: {ov!r} -> {nv!r} [{conf}]")
        else:
            continue
        new_row[k] = nv
    if inprod and not yt:
        if h.get('year_to') is not None:
            changes['year_to cleared (in production)'] += 1
        new_row['in_production'] = True
    elif inprod is False and yt is None:
        pass

    sources = [s for s in (r.get('sources') or []) if isinstance(s, str) and re.match(r'^https?://', s)][:3]
    note_bits = [clean(r.get('notes')), f'Confidence: {conf}.', ('Sources: ' + ' '.join(sources)) if sources else None]
    new_row['notes'] = ' '.join(filter(None, note_bits))[:900]
    new_row['_conf'] = conf
    new_row['_old_notes'] = h.get('notes')
    out.append(new_row)

missing = [i for i in db if i not in seen]
print('file rows', len(rows), 'unique', len(seen), 'dup', dup, 'unknown ids', unknown, 'db rows not in file', len(missing))
print('manual rows skipped', skipped_manual)
print('confidence', dict(conf_count))
print('problems', dict(prob))
for k, ex in examples.items():
    print('  ', k, ex)
print('changes', dict(changes))
for k, ex in ow_examples.items():
    print('overwrite', k, len(ex))
    for e in ex:
        print('     ', e)
json.dump(out, open(os.path.join(D, 'enriched_rows.json'), 'w', encoding='utf-8'))
