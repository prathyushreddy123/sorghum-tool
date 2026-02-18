## Known Issues

### Session lost after backend restart (requires re-login)
**Root cause:** `SECRET_KEY` in `backend/config.py` is generated randomly on every startup
(`SECRET_KEY: str = secrets.token_hex(32)`). Any backend restart (including uvicorn
`--reload` hot-reload) invalidates all existing JWT tokens, forcing users to log in again.
**Fix:** Generate a stable key once and persist it in `backend/.env`:
```
SECRET_KEY=<output of: python3 -c "import secrets; print(secrets.token_hex(32))">
```
Then the key survives restarts and tokens stay valid for their 24-hour TTL.
