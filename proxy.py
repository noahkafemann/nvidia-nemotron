from flask import Flask, request, jsonify, make_response, session, Response
import requests
import os
import sqlite3
import json
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import uuid
import logging
from datetime import datetime, timezone
from pymongo import MongoClient

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
MODEL = 'nvidia/nemotron-3-ultra-550b-a55b'
MONGODB_URI = os.environ.get('MONGODB_URI', '')

# MongoDB Client Setup
client = None
db = None

def connect_db():
    global client, db
    if client is None:
        try:
            if not MONGODB_URI:
                logger.error("MONGODB_URI is not set in environment variables!")
                return False
            client = MongoClient(MONGODB_URI)
            db = client.get_database('nemotron_db')
            logger.info("Successfully connected to MongoDB Atlas")
            return True
        except Exception as e:
            logger.error(f"MongoDB Connection failed: {e}")
            return False
    return True

def chat_sort_value(value):
    if isinstance(value, datetime):
        return value.timestamp()
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).timestamp()
        except ValueError:
            return 0
    if isinstance(value, (int, float)):
        return float(value)
    return 0

# Ensure connection on startup
connect_db()

@app.after_request
def after_request(response):
    # Force CORS headers on every single response to prevent browser blocks
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, PUT, DELETE'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'has_key': bool(os.environ.get('NVIDIA_API_KEY', '')),
        'model': MODEL
    }), 200

@app.route('/auth/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        if not email or not password:
            return jsonify({'error': 'Email und Passwort erforderlich'}), 400

        if not connect_db():
            return jsonify({'error': 'Datenbankverbindung fehlgeschlagen'}), 500

        users_col = db.users
        if users_col.find_one({'email': email}):
            return jsonify({'error': 'Email bereits vergeben'}), 400

        user_id = str(uuid.uuid4())
        hashed_pw = generate_password_hash(password)

        users_col.insert_one({
            'id': user_id,
            'email': email,
            'password': hashed_pw
        })

        return jsonify({'message': 'User registriert', 'userId': user_id}), 201
    except Exception as e:
        logger.error(f"Register error: {e}")
        return jsonify({'error': 'Interner Serverfehler'}), 500

@app.route('/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not connect_db():
            return jsonify({'error': 'Datenbankverbindung fehlgeschlagen'}), 500

        user = db.users.find_one({'email': email})

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

    if not connect_db():
        return jsonify({'error': 'Datenbankverbindung fehlgeschlagen'}), 500

    chats_col = db.chats

    if request.method == 'POST':
        try:
            data = request.get_json()
            chat_id = str(uuid.uuid4())
            title = data.get('title', 'Neuer Chat')

            chats_col.insert_one({
                'id': chat_id,
                'user_id': user_id,
                'title': title,
                'updated_at': datetime.now(timezone.utc).isoformat()
            })
            return jsonify({'id': chat_id, 'title': title}), 201
        except Exception as e:
            logger.error(f"Create chat error: {e}")
            return jsonify({'error': 'Fehler beim Erstellen des Chats'}), 500

    try:
        # Get chats for user, newest first
        chats = list(chats_col.find({'user_id': user_id}))
        chats.sort(key=lambda c: chat_sort_value(c.get('updated_at')), reverse=True)

        msgs_col = db.messages
        result = []
        for c in chats:
            first_msg = msgs_col.find_one(
                {'chat_id': c['id'], 'role': 'user'},
                sort=[('_id', 1)]
            )
            preview = ''
            if first_msg and first_msg.get('content'):
                preview = first_msg['content'][:140]

            result.append({
                'id': c['id'],
                'title': c.get('title', 'Neuer Chat'),
                'updated_at': c.get('updated_at'),
                'message_count': msgs_col.count_documents({'chat_id': c['id']}),
                'preview': preview
            })
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Get chats error: {e}")
        return jsonify({'error': 'Fehler beim Laden der Chats'}), 500

@app.route('/chats/<chat_id>/messages', methods=['GET', 'POST', 'OPTIONS'])
def handle_messages(chat_id):
    if request.method == 'OPTIONS': return make_response(), 200
    user_id = request.headers.get('Authorization')
    if not user_id: return jsonify({'error': 'Nicht autorisiert'}), 401

    if not connect_db():
        return jsonify({'error': 'Datenbankverbindung fehlgeschlagen'}), 500

    msgs_col = db.messages
    chats_col = db.chats

    chat = chats_col.find_one({'id': chat_id, 'user_id': user_id})
    if not chat:
        return jsonify({'error': 'Chat nicht gefunden'}), 404

    if request.method == 'POST':
        try:
            data = request.get_json()
            role = data.get('role')
            content = data.get('content')

            msgs_col.insert_one({
                'chat_id': chat_id,
                'role': role,
                'content': content
            })

            # Update chat timestamp
            chats_col.update_one(
                {'id': chat_id, 'user_id': user_id},
                {'$set': {'updated_at': datetime.now(timezone.utc).isoformat()}}
            )

            return jsonify({'status': 'gespeichert'}), 201
        except Exception as e:
            logger.error(f"Save message error: {e}")
            return jsonify({'error': 'Fehler beim Speichern der Nachricht'}), 500

    try:
        msgs = list(msgs_col.find({'chat_id': chat_id}))
        return jsonify([{'role': m['role'], 'content': m['content']} for m in msgs]), 200
    except Exception as e:
        logger.error(f"Get messages error: {e}")
        return jsonify({'error': 'Fehler beim Laden der Nachrichten'}), 500

@app.route('/chat', methods=['POST', 'OPTIONS'])
def chat():
    if request.method == 'OPTIONS': return make_response(), 200
    api_key = os.environ.get('NVIDIA_API_KEY', '')
    if not api_key:
        logger.error("CRITICAL: NVIDIA_API_KEY missing!")
        return jsonify({'error': 'Server-Konfigurationsfehler: API Key fehlt.'}), 500

    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or not data:
            return jsonify({'error': 'Ungültige JSON-Anfrage'}), 400

        stream = data.get('stream', False)
        logger.info(f"Chat request: stream={stream}, messages={len(data.get('messages', []))}")

        if stream:
            def generate():
                try:
                    with requests.Session() as session:
                        r = session.post(
                            f'{API_BASE}/chat/completions',
                            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {api_key}'},
                            json={
                                'model': MODEL,
                                'messages': data.get('messages', []),
                                'temperature': data.get('temperature', 0.7),
                                'max_tokens': data.get('max_tokens', 1024),
                                'stream': True
                            },
                            stream=True,
                            timeout=(10, 180)
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
                    'model': MODEL,
                    'messages': data.get('messages', []),
                    'temperature': data.get('temperature', 0.7),
                    'max_tokens': data.get('max_tokens', 1024),
                    'stream': False
                },
                timeout=(10, 180)
            )
            if response.status_code != 200:
                logger.error(f"NVIDIA non-streaming error {response.status_code}: {response.text[:500]}")
            try:
                return jsonify(response.json()), response.status_code
            except ValueError:
                return jsonify({'error': f'NVIDIA API Error {response.status_code}: {response.text[:500]}'}), response.status_code
    except Exception as e:
        logger.error(f"Chat endpoint error: {e}")
        return jsonify({'error': f"Interner Serverfehler: {str(e)}"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
