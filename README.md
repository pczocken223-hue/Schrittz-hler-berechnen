# Tabak-Tracker

Web-App (PWA) ohne Server und ohne Build-Schritt. Alle Daten bleiben im Browser.

## Auf GitHub Pages veröffentlichen
1. Neues Repository auf GitHub anlegen.
2. Alle Dateien **mit dem Ordner `icons`** hochladen (Add file → Upload files). `index.html` muss im Hauptverzeichnis liegen.
3. Settings → Pages → Branch `main` und Ordner `/ (root)` wählen → Save.
4. Nach ca. einer Minute ist die App unter `https://DEIN-NAME.github.io/REPO-NAME/` erreichbar.

## Auf dem Handy installieren
- Android (Chrome): oben auf „Installieren“ tippen oder Einstellungen → „App installieren“.
- iPhone (Safari): Teilen → „Zum Home-Bildschirm“.

## Alte Daten übernehmen
Die neue Adresse hat einen eigenen Speicher. In der alten Datei „Als Datei speichern“, in der neuen App
Einstellungen → „Sicherung laden“.

## Nach Änderungen
In `sw.js` die Zahl bei `CACHE = 'tabak-tracker-v1'` erhöhen, damit alle Geräte die neue Version laden.
