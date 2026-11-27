#!/bin/bash
# One port: server.py serves the built app (app/dist) and saves your files. Opens http://localhost:8000/
cd "$(dirname "$0")"
PORT="${PORT:-8000}"

# Rebuild the UI only when it is missing or older than its source.
if [ ! -f app/dist/index.html ] || [ -n "$(find app/src app/index.html app/vite.config.js app/package.json -newer app/dist/index.html 2>/dev/null | head -1)" ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "Building the app..."
    (cd app && { [ -d node_modules ] || npm install; } && npm run build) || echo "Build failed: serving the last build (or the old page)."
  else
    echo "Node/npm not found: serving the last build (or the old page)."
  fi
fi

# Replace any server already on this port, so you always run the current code.
old="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null)"
if [ -n "$old" ]; then
  echo "Stopping the server already on port $PORT (pid $old)..."
  kill $old 2>/dev/null; sleep 1
fi

(sleep 1; open "http://localhost:$PORT/") &
PORT="$PORT" python3 server.py
