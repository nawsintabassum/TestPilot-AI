# TestPilot AI — Local Development Starter

TestPilot AI is a local Python test engineering workspace with source analysis, test suggestion generation, syntax validation, project saving, run history, and report export.

## Requirements
- Python 3.10+
- Node.js 18+
- npm
- Optional: Docker, only if you want to configure isolated pytest execution

## 1. Start the backend (Git Bash)
Open Git Bash in the extracted `TestPilot-AI-Complete-Project` folder, then:

```bash
cd testpilot-ai/backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Keep this terminal open. API docs: http://127.0.0.1:8000/docs

## 2. Start the frontend
Open a second Git Bash terminal:

```bash
cd ~/Downloads/TestPilot-AI-Complete-Project/testpilot-ai/frontend
npm install
npm run dev
```

Open the URL Vite prints, usually http://localhost:5173.

## Login and registration note
This starter includes a working **browser-local demo** registration/login screen so the UI can be tried without external setup. Accounts are stored in that browser's local storage and password hashes are stored rather than raw passwords. This is **not production authentication**: it is not shared across browsers/devices and should not be used for real accounts. For production, implement server-side authentication, secure password hashing (Argon2/bcrypt), sessions/cookies, CSRF protection, rate limiting, and per-user authorization.

## Buttons and limitations
- Save/New project, source analysis, test suggestion generation, syntax validation, history refresh, theme toggle, sign out, and report links are connected to UI/API actions.
- Generated tests are suggestions and must be reviewed.
- Actual pytest execution is intentionally disabled unless the isolated Docker runner is configured and reviewed. The Run Tests action should report that limitation rather than fabricate a passing result.
- The current project API is a local learning starter and does not provide production-grade per-user project isolation.

## Troubleshooting
- If `cd testpilot-ai/backend` says the folder is missing, check `pwd` and `ls -la`; you may already be inside `testpilot-ai/backend`.
- If `npm` is not recognized, install Node.js LTS and reopen Git Bash.
- Do not close the backend terminal while using the frontend.
