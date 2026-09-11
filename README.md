# Aapurtikar — working full-stack web app

Aapurtikar is a same-origin FastAPI + SQLite web application containing two connected interfaces:

- **Farmer App:** mobile/OTP demo login, Aadhaar demo validation, location/centre selection, crop registration, permanent farmer token, procurement requests, shipment history, grades and payment history.
- **Worker Portal:** worker registration, farmer submissions, appointment allocation, token verification, crop grading, simulated payment and operational history.

## Run locally

Requirements: Python 3.10+

```bash
cd Aapurtikar
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\\Scripts\\activate
pip install -r backend/requirements.txt
cp .env.example .env             # Windows: copy .env.example .env
python run.py
```

Open:

- http://localhost:8000/ — Aapurtikar launcher
- http://localhost:8000/farmer/ — Farmer App
- http://localhost:8000/worker/ — Worker Portal
- http://localhost:8000/api/docs — API documentation

The backend serves both frontends, so `/api` calls work without CORS problems and the two apps share the same SQLite database.

## API keys / integrations

**Do not hard-code private API keys into JavaScript or commit them to GitHub.** The project includes `.env.example` with secure server-side configuration slots.

### Recommended integrations

1. **Twilio SMS** — useful for real appointment/queue notifications.
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER`
2. **Google Maps Platform** — useful for showing procurement-centre locations and navigation.
   - `GOOGLE_MAPS_API_KEY`
   - Restrict a browser key by HTTP referrer in Google Cloud.

The current prototype intentionally remains fully usable with these values empty. SMS and maps can be added without changing the core farmer/worker flow.

## Demo data

The backend seeds four demo farmers on first start. Worker login accepts dummy 12-digit Aadhaar data; the farmer OTP is also intentionally simulated.

## Production notes

Before production, replace demo authentication with real OTP/identity verification, use PostgreSQL/Supabase instead of SQLite, add role-based authentication, HTTPS, rate limiting, audit logs, CSRF/session protections as appropriate, and integrate an approved payment gateway rather than collecting bank credentials in a prototype form.
