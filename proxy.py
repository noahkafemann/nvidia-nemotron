from flask import Flask, request, jsonify
import requests
import os

app = Flask(__name__)

# API-Key als Umgebungsvariable setzen (nie im Code!)
NVIDIA_API_KEY = os.environ.get('NVIDIA_API_KEY', '')
API_BASE = 'https://integrate.api.nvidia.com/v1'

@app.route('/chat', methods=['POST'])
def chat():
    if not NVIDIA_API_KEY:
        return jsonify({'error': 'API Key nicht auf dem Server konfiguriert'}), 500

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Keine JSON-Daten empfangen'}), 400

    try:
        response = requests.post(
            f'{API_BASE}/chat/completions',
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {NVIDIA_API_KEY}'
            },
            json={
                'model': data.get('model', 'nvidia/nemotron-3-ultra-550b-a55b'),
                'messages': data.get('messages', []),
                'temperature': data.get('temperature', 0.7),
                'top_p': data.get('top_p', 1),
                'max_tokens': data.get('max_tokens', 1024),
                'stream': False
            },
            timeout=60
        )
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'has_key': bool(NVIDIA_API_KEY)})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
