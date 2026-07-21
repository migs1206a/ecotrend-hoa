# Ecotrend HOA Atlas

Full-stack HOA management system.

## Project Structure

- `backend/` - Node.js and Express API for authentication, residents, guards, facilities, billing, reports, AI tools, and file handling.
- `frontend/` - React client application.

## Deployment Notes

- Deploy the backend as a Node web service with `backend` as the root directory.
- Deploy the frontend as a static React build.
- Use MongoDB Atlas for the production database.
- Set production secrets through the host's environment variable settings. Do not commit `.env` files.

## CCTV Relay

For self-hosted CCTV relay setup files and production steps, see:

- [docs/CCTV_RELAY_SETUP.md](docs/CCTV_RELAY_SETUP.md)
- `infra/cctv-relay/`
