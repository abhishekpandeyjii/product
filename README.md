# Product Review App

A small, deployable product review website with an Express API, SQLite storage, and a password-protected admin review table. Phone numbers are optional and are only stored when the reviewer checks the contact-permission box.

## Run locally

1. Install Node.js 20 or newer.
2. Extract this folder and open a terminal inside it.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env` and change `ADMIN_PASSWORD` to a long, unique password. Set the product name/description/price if you want.
5. Start:
   ```bash
   npm start
   ```
6. Open `http://localhost:3000`.

The database is created at `data/reviews.sqlite`.

## Deploy on Render

1. Push this project to a GitHub repository.
2. In Render, create a **Web Service** and connect that repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables in Render:
   - `ADMIN_PASSWORD`: a long, unique password
   - `PRODUCT_NAME`: your product name
   - `PRODUCT_DESCRIPTION`: short product description
   - `PRODUCT_PRICE`: displayed price
6. For persistent reviews, attach a Render persistent disk and configure the database path to that disk before going live. The current starter stores SQLite at `./data/reviews.sqlite`; without persistent storage, some hosts may reset the database on redeploy/restart. For production, use a managed persistent database or update the database path for the mounted disk.

## Important before public launch

- Replace the sample product details.
- Use HTTPS and a strong admin password.
- Back up the database and test admin access.
- This starter uses a shared admin password header. For a larger or sensitive deployment, add proper admin sessions, password hashing, CSRF protection, and audit logging.
- Do not use this form to disguise the purpose of collecting contact information. Clearly tell reviewers who will contact them and why.
- The app does not discover numbers from visitors' devices or social accounts.
