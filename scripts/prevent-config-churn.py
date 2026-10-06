"""Keep Java Properties files out of live AutoModpack updates.

Run on the server with --server-dir <Minecraft directory>. --apply writes
the preventive rules; reload AutoModpack and generate the pack afterward.
Without --apply, exits unsuccessfully if Properties files remain published.
"""
import argparse
import datetime
import json
import pathlib
import re
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--server-dir', type=pathlib.Path, required=True)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
root = args.server_dir.resolve(strict=True)
config = root / 'automodpack' / 'server.conf'
projection = root / 'automodpack' / 'server' / 'current-projection.json'
rules = ('config/*.properties', 'config/**/*.properties')
text = config.read_text(encoding='utf-8')
matches = list(re.finditer(r'(?m)^(\s*exclude:\s*\[)([^\]\r\n]*)(\])', text))
if len(matches) != 1:
    raise SystemExit('Expected exactly one group with an inline exclude list; configuration preserved.')
match = matches[0]
existing = {part.strip().strip('"\'') for part in match[2].split(',')}
missing = [rule for rule in rules if rule not in existing]
if args.apply and missing:
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = config.with_name(f'server.conf.before-local-properties-{timestamp}.backup')
    shutil.copy2(config, backup)
    replacement = match[1] + ', '.join(missing) + ', ' + match[2] + match[3]
    config.write_text(text[:match.start()] + replacement + text[match.end():], encoding='utf-8')
    print('Preventive rules added:', ', '.join(missing))
    print('Configuration backup:', backup.name)
    print('Run: automodpack config reload, then automodpack generate')
elif missing:
    raise SystemExit('Preventive rules missing: ' + ', '.join(missing))
else:
    print('Preventive rules already present; configuration preserved.')
if not args.apply:
    document = json.loads(projection.read_text(encoding='utf-8'))
    published = [entry['logicalPath'] for entry in document['ownershipLedger']['entries']
                 if entry['currentStatus'] == 'PRESENT'
                 and entry['logicalPath'].startswith('config/')
                 and entry['logicalPath'].endswith('.properties')]
    if published:
        raise SystemExit('Properties files still published: ' + ', '.join(sorted(published)))
    print('Published pack verified: no live Properties files synchronized.')
