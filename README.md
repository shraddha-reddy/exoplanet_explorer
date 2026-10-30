# Exoplanet Explorer

Interactive sky map and system viewer for confirmed exoplanets (NASA data), with an AI astronomer grounded in that data.

## Run it

Backend (needs Python 3.10+ and Ollama):

    cd backend
    python3 -m venv venv
    source venv/bin/activate
    pip install fastapi uvicorn requests python-dotenv
    cp .env.example .env
    ollama pull llama3.2
    uvicorn main:app --reload

Frontend (second terminal):

    cd frontend
    npm install
    npm run dev

Open http://localhost:5173

## Structure

- backend/main.py: API (/planets, /chat) and the astronomer system prompt
- backend/exoplanets.json: NASA data (refresh with fetch_data.py)
- frontend/src/App.jsx: sky view
- frontend/src/SystemView.jsx: 3D system view
- frontend/src/Panel.jsx, Dots.jsx, Halo.jsx, FlyTo.jsx: sky view pieces

## Working together

Never push to main. Branch, push, open a Pull Request:

    git checkout -b ui/your-feature
    git push -u origin ui/your-feature

Run `git pull origin main` before starting new work.
