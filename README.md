# NVIDIA Nemotron Chat

Futuristische Chat-Oberfläche für das NVIDIA Nemotron Modell.

## Einrichtung

1. Lege deinen NVIDIA API Key als GitHub Secret (Repository → Settings → Secrets and variables → Actions) unter dem Namen `NVIDIA_API_KEY` an.
2. Der Key wird über die Umgebungsvariable `VITE_NVIDIA_API_KEY` gelesen.

## Features

- **Nemotron Pulse**: Live-Telemetrie mit TTFT, Tokens pro Sekunde, Token-Zähler, Kontextauslastung und Sparkline.
- **Conversation Branching**: Jede Assistant-Antwort lässt sich per Branch-Button als eigener Chat fortführen.
- **Ideen-Schmiede**: Kuratierte Prompt-Impulse mit Kategorien und Zufallsgenerator.
- **6 Themes**: Futuristisch, Klassisch, Neon Night, Deep Ocean, Sunset Glow und Emerald Forest.
- **Persistenter Verlauf**: Chats werden pro Account gespeichert und im Verlauf mit Vorschau, Nachrichtenzahl und Datum angezeigt.

## Technologie

- Reine HTML/CSS/JS Seite (kein Build nötig)
- NVIDIA API: `https://integrate.api.nvidia.com/v1/chat/completions`
- Modell: `nvidia/nemotron-3-ultra-550b-a55b`

## Hinweis

Der API Key wird **nicht** im Code hardcodet, sondern zur Laufzeit aus der Umgebung geladen. Für GitHub Pages kannst du den Key über GitHub Actions injizieren oder lokal über eine `.env`-Datei bereitstellen.