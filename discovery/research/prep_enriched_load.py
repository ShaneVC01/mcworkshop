import json, os, collections, re
D = os.path.dirname(os.path.abspath(__file__))
raw = open(os.path.join(D, 'library_raw.json'), encoding='utf-8-sig').read()
hist = {r['id']: r for r in json.loads(raw[raw.index('{'):raw.rindex('}') + 1])['rows']}
db = {r['id']: r for r in json.load(open(os.path.join(D, 'db_now.json'), encoding='utf-8'))}
src = {r['id']: r for r in json.load(open(r'C:\Users\ShaneCoetser_tpupr7j\Downloads\vehicle_library_enriched_full.json', encoding='utf-8-sig'))}
rows = json.load(open(os.path.join(D, 'enriched_rows.json'), encoding='utf-8'))

def clean(t):
    if t is None: return None
    return (str(t).replace('\u2014', ', ').replace('\u2013', ' to ').replace(' - ', ', ').strip()) or None

load, widened = [], 0
kind = collections.Counter()
for r in rows:
    i = r['id']; h = hist.get(i, {}); s = src[i]; o = db[i].get('notes')
    if r['_conf'] == 'low':
        continue
    conf = r['_conf']
    hf, ht = h.get('hist_from'), h.get('hist_to')
    yf = r.get('year_from', db[i].get('year_from')); yt = r.get('year_to', db[i].get('year_to'))
    add = []
    if yf and hf and hf < yf:
        r['year_from'] = hf; add.append(f'Researched start was {yf}, but workshop records include vehicles from {hf}. Range widened to cover them.')
    if yt and ht and ht > yt and not r.get('in_production'):
        r['year_to'] = ht; add.append(f'Researched end was {yt}, but workshop records include vehicles to {ht}. Range widened to cover them.')
    sources = [x for x in (s.get('sources') or []) if isinstance(x, str) and re.match(r'^https?://', x)][:3]
    agent = clean(s.get('notes'))
    if o and agent and clean(o) == agent:
        # echo of the existing note: keep it, add only a widening sentence it does not already hold
        base = o; kind['kept existing'] += 1
        add = [a for a in add if 'Range widened' not in base]
        if add:
            head, sep, tail = base.partition(' Confidence:')
            base = head + ' ' + ' '.join(add) + (sep + tail if sep else '')
        note = base
    else:
        kind['new text'] += 1
        note = ' '.join(filter(None, [agent, ' '.join(add), f'Confidence: {conf}.', ('Sources: ' + ' '.join(sources)) if sources else None]))
    widened += len(add)
    r['notes'] = note[:900]
    for k in ('_conf', '_old_notes'): r.pop(k, None)
    load.append(r)
print('to load', len(load), dict(kind), 'widening notes', widened)
json.dump(load, open(os.path.join(D, 'enriched_load.json'), 'w', encoding='utf-8'))
# sanity: duplicated 'Confidence:' in any note
print('notes with 2+ Confidence:', sum(1 for r in load if r['notes'].count('Confidence:') > 1))
print('missing note', sum(1 for r in load if not r['notes']))
# SQL file
sql = "select public.apply_vehicle_library_research($json$" + json.dumps(load, ensure_ascii=False) + "$json$::jsonb);"
assert '$json$' not in json.dumps(load)
open(os.path.join(D, 'apply_enriched.sql'), 'w', encoding='utf-8').write(sql)
print('sql bytes', len(sql.encode('utf-8')))
