from flask import Flask, request, jsonify, make_response, session, Response
import requests
import os
import sqlite3
import json
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import uuid
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'nemotron-secret-key-123')

# Maximum CORS flexibility for Render deployment
CORS(app, resources={r"/*": {"origins": "*"}})

# Environment Variables
NVIDIA_API_KEY = os.environ.get('NVIDIA_API_KEY', '')
API_BASE = 'https://integrate.api.nvidia.com/v1'

# Use /data/database.db if on Render (Persistent Disk), otherwise local
DB_PATH = os.environ.get('DATABASE_URL', '/data/database.db' if os.path.exists('/data') else 'database.db')
logger.info(f"Using database path: {DB_PATH}")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    try:
        with get_db() as conn:
            conn.execute('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, password TEXT)')
            conn.execute('CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)')
            conn.execute('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT, role TEXT, content TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id)')
            conn.commit()
    except Exception as e:
        logger.error(f"Database init failed: {e}")

init_db()

@app.after_request
def after_request(response):
    # Force CORS headers on every single response to prevent browser blocks
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, PUT, DELETE'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.route('/auth/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        if not email or not password:
            return jsonify({'error': 'Email und Passwort erforderlich'}), 400
        user_id = str(uuid.uuid4())
        hashed_pw = generate_password_hash(password)
        with get_db() as conn:
            conn.execute('INSERT INTO users (id, email, password) VALUES (?, ?, ?)', (user_id, email, hashed_pw))
            conn.commit()
        return jsonify({'message': 'User registriert', 'userId': user_id}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Email bereits vergeben'}), 400
    except Exception as e:
        logger.error(f"Register error: {e}")
        return jsonify({'error': 'Interner Serverfehler'}), 500

@app.route('/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        with get_db() as conn:
            user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        if user and check_password_hash(user['password'], password):
            return jsonify({'message': 'Login erfolgreich', 'userId': user['id']}), 200
        return jsonify({'error': 'Ungültige Zugangsdaten'}), 401
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({'error': 'Interner Serverfehler'}), 500

@app.route('/chats', methods=['GET', 'POST', 'OPTIONS'])
def handle_chats():
    if request.method == 'OPTIONS': return make_response(), 200
    user_id = request.headers.get('Authorization')
    if not user_id: return jsonify({'error': 'Nicht autorisiert'}), 401
    if request.method == 'POST':
        try:
            data = request.get_json()
            chat_id = str(uuid.uuid4())
            title = data.get('title', 'Neuer Chat')
            with get_db() as conn:
                conn.execute('INSERT INTO chats (id, user_id, title) VALUES (?, ?, ?)', (chat_id, user_id, title))
                conn.commit()
            return jsonify({'id': chat_id, 'title': title}), 201
        except Exception as e:
            logger.error(f"Create chat error: {e}")
            return jsonify({'error': 'Fehler beim Erstellen des Chats'}), 500
    try:
        with get_db() as conn:
            chats = conn.execute('SELECT * FROM chats WHERE user_id = ? ORDER BY updated_at DESC', (user_id,)).fetchall()
            return jsonify([dict(row) for row in chats]), 200
    except Exception as e:
        logger.error(f"Get chats error: {e}")
        return jsonify({'error': 'Fehler beim Laden der Chats'}), 500

@app.route('/chats/<chat_id>/messages', methods=['GET', 'POST', 'OPTIONS'])
def handle_messages(chat_id):
    if request.method == 'OPTIONS': return make_response(), 200
    user_id = request.headers.get('Authorization')
    if not user_id: return jsonify({'error': 'Nicht autorisiert'}), 401
    if request.method == 'POST':
        try:
            data = request.get_json()
            role = data.get('role')
            content = data.get('content')
            with get_db() as conn:
                conn.execute('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)', (chat_id, role, content))
                conn.execute('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', (chat_id,))
                conn.commit()
            return jsonify({'status': 'gespeichert'}), 201
        except Exception as e:
            logger.error(f"Save message error: {e}")
            return jsonify({'error': 'Fehler beim Speichern der Nachricht'}), 500
    try:
        with get_db() as conn:
            msgs = conn.execute('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC', (chat_id,)).fetchall()
            return jsonify([dict(row) for row in msgs]), 200
    except Exception as e:
        logger.error(f"Get messages error: {e}")
        return jsonify({'error': 'Fehler beim Laden der Nachrichten'}), 500

@app.route('/chat', methods=['POST', 'OPTIONS'])
def chat():
    if request.method == 'OPTIONS': return make_response(), 200

    # Check for API Key carefully
    api_key = os.environ.get('NVIDIA_API_KEY', '')
    if not api_key:
        logger.error("CRITICAL: NVIDIA_API_KEY is missing in environment variables!")
        return jsonify({'error': 'Server-Konfigurationsfehler: NVIDIA_API_KEY fehlt in Render-Umgebungsvariablen.'}), 500

    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Keine Daten empfangen'}), 400

        stream = data.get('stream', False)

        if stream:
            def generate():
                try:
                    # Using a session for stability
                    with requests.Session() as session:
                        r = session.post(
                            f'{API_BASE}/chat/completions',
                            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'},
                            json={
                                'model': data.get('model', 'nvidia/nemotron-3-ultra-550b-a55b'),
                                'messages': data.get('messages', []),
                                'temperature': data.get('temperature', 0.7),
                                'max_tokens': data.get('max_tokens', 1024),
                                'stream': True
                            },
                            stream=True,
                            timeout=60
                        )
                        if r.status_code != 200:
                            err_msg = json.dumps({'error': f'NVIDIA API Error {r.status_code}: {r.text}'})
                            yield f"data: {err_msg}\n\n"
                            return

                        for line in r.iter_lines():
                            if line:
                                decoded_line = line.decode('utf-8')
                                if decoded_line.startswith('data: '):
                                    yield f"{decoded_line}\n\n"
                                elif decoded_line == 'data: [DONE]':
                                    yield "data: [DONE]\n\n"
                except Exception as e:
                    logger.error(f"Stream error: {e}")
                    err_msg = json.dumps({'error': str(e)})
                    yield f"data: {err_msg}\n\n"

            return Response(generate(), mimetype='text/event-stream')
        else:
            response = requests.post(
                f'{API_BASE}/chat/completions',
                headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'},
                json={
                    'model': data.get('model', 'nvidia/nemotron-3-ultra-550b-a55b'),
                    'messages': data.get('messages', []),
                    'temperature': data.get('temperature', 0.7),
                    'max_tokens': data.get('max_tokens', 1024),
                    'stream': False
                },
                timeout=60
            )
            return jsonify(response.json()), response.status_code
    except Exception as e:
        logger.error(f"Chat endpoint error: {e}")
        return jsonify({'error': f"Interner Serverfehler: {str(e)}"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
