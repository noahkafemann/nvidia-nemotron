from flask import Flask, request, jsonify, make_response
import requests
import os

app = Flask(__name__)

NVIDIA_API_KEY = os.environ.get('NVIDIA_API_KEY', '')
API_BASE = 'https://integrate.api.nvidia.com/v1'

def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response

@app.route('/chat', methods=['POST', 'OPTIONS'])
def chat():
    if request.method == 'OPTIONS':
        resp = make_response()
        return add_cors_headers(resp)

    if not NVIDIA_API_KEY:
        resp = jsonify({'error': 'API Key nicht auf dem Server konfiguriert'})
        return add_cors_headers(resp), 500

    data = request.get_json()
    if not data:
        resp = jsonify({'error': 'Keine JSON-Daten empfangen'})
        return add_cors_headers(resp), 400

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
                'temperature': 0.7,
                'top_p': data.get('top_p', 1),
                'max_tokens': data.get('max_tokens', 1024),
                'stream': False
            },
            timeout=60
        )
        resp = jsonify(response.json())
        return add_cors_headers(resp), response.status_code
    except Exception as e:
        resp = jsonify({'error': str(e)})
        return add_cors_headers(resp), 500

@app.route('/health', methods=['GET', 'OPTIONS'])
def health():
    if request.method == 'OPTIONS':
        resp = make_response()
        return add_cors_headers(resp)

    resp = jsonify({'status': 'ok', 'has_key': bool(NVIDIA_API_KEY)})
    return add_cors_headers(resp), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))