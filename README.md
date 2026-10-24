# NVIDIA Nemotron Chat

Futuristische Chat-Oberfläche für das NVIDIA Nemotron Modell.

## Einrichtung

1. Lege deinen NVIDIA API Key als GitHub Secret (Repository → Settings → Secrets and variables → Actions) unter dem Namen `NVIDIA_API_KEY` an.
2. Der Key wird über die Umgebungsvariable `VITE_NVIDIA_API_KEY` gelesen.

## Technologie

- Reine HTML/CSS/JS Seite (kein Build nötig)
- NVIDIA API: `https://integrate.api.nvidia.com/v1/chat/completions`
- Modell: `nvidia/nemotron-4-340b-instruct`

## Hinweis

Der API Key wird **nicht** im Code hardcodet, sondern zur Laufzeit aus der Umgebung geladen. Für GitHub Pages kannst du den Key über GitHub Actions injizieren oder lokal über eine `.env`-Datei bereitstellen.