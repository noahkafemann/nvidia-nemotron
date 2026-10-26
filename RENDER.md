# Render.com Deploy-Anleitung

## 1. Web Service auf Render erstellen
1. Gehe auf [render.com](https://render.com) und logge dich ein
2. Klicke auf **"New +" → "Web Service"**
3. Verbinde dein GitHub-Repo `noahkafemann/nvidia-nemotron`
4. Einstellungen:
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn proxy:app`
5. Unter **Environment Variables** füge hinzu:
   - `NVIDIA_API_KEY` = dein NVIDIA API Key
6. Klicke auf **"Create Web Service"**
7. Warte auf den Deploy → du bekommst eine URL wie `https://dein-proxy.onrender.com`

## 2. PROXY_URL in script.js anpassen
Ändere Zeile 3 in `script.js`:
```javascript
const PROXY_URL = 'https://dein-proxy.onrender.com/chat';
```
Ersetze `dein-proxy` durch deine tatsächliche Render-URL.

## 3. Pushen und mergen
```bash
git add -A
git commit -m "Add Render.com proxy with requirements.txt"
git push origin test-for-github-pages
```
Dann Pull Request von `test-for-github-pages` auf `main` erstellen und mergen.

## 4. GitHub Pages aktivieren
Settings → Pages → Build source: GitHub Actions

## Teste den Proxy
Öffne: `https://dein-proxy.onrender.com/health`
Erwartet: `{"has_key": true, "status": "ok"}`
