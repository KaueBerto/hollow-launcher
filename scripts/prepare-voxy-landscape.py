"""Inspect the supplied ZIP in a bounded stream and build its download manifest."""
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile

archive = Path(sys.argv[1])
output = Path(sys.argv[2])
before = archive.stat()
server = 'hollowsmp.com.br'
files = []
with zipfile.ZipFile(archive) as source:
    seen = set()
    for item in source.infolist():
        assert not item.flag_bits & 1, 'Encrypted ZIP is not supported'
        assert (item.external_attr >> 16) & 0xf000 != 0xa000, 'Symlink in ZIP'
        assert item.filename.startswith(server + '/'), 'Unexpected archive root'
        relative = item.filename[len(server) + 1:]
        if item.is_dir():
            assert not relative or re.fullmatch(r'[a-f0-9]{32}/(?:storage/)?', relative), 'Unexpected directory'
            continue
        assert relative == 'config.json' or re.fullmatch(r'[a-f0-9]{32}/storage/[A-Za-z0-9_.-]+', relative), relative
        assert relative.lower() not in seen, 'Duplicate path'
        seen.add(relative.lower())
        digest = hashlib.sha256()
        count = 0
        with source.open(item) as stream:
            while data := stream.read(2 * 1024 * 1024):
                count += len(data)
                digest.update(data)
        assert count == item.file_size
        files.append({'path': relative, 'bytes': count, 'sha256': digest.hexdigest()})
        if len(files) % 16 == 0:
            print(f'Verified {len(files)} files', flush=True)

print('Hashing complete archive', flush=True)
with archive.open('rb') as stream:
    checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
after = archive.stat()
assert (before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns), 'Archive changed during preparation'
manifest = {
    'schema': 1, 'kind': 'voxy-rocksdb', 'version': 1, 'server': server,
    'archiveRoot': server, 'bytes': before.st_size, 'sha256': checksum,
    'unpackedBytes': sum(item['bytes'] for item in files),
    'url': f'https://painel.hollowsmp.com.br/averon-voxy/{checksum}.zip',
    'files': sorted(files, key=lambda item: item['path']),
}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'bytes': manifest['bytes'], 'unpackedBytes': manifest['unpackedBytes'], 'sha256': checksum, 'files': len(files)}), flush=True)
