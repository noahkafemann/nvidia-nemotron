import os
import sys

key = os.environ.get('NVIDIA_API_KEY', '')
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'

with open(path, 'r') as f:
    content = f.read()

content = content.replace('__NVIDIA_API_KEY__', key)

with open(path, 'w') as f:
    f.write(content)

print('API key injected' if key else 'WARNUNG: Kein API Key gefunden')
