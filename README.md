# Mazzi Mail

A separate MERN-style mail campaign workspace built with Vite, React, Bootstrap, Express, and optional MongoDB persistence. The interface follows the visible workflow in the mailer reference video: contact list, Import / Message / Configure steps, Start / Stop preview controls, status, and task counters.

## Current scope

This version is a **preview-only campaign manager**. It imports contacts with consent metadata, excludes contacts not marked `opted_in=true`, supports CSV column mapping, previews plain-text/HTML/AMP-labeled message source with merge fields, and records preview history. It does **not** connect to SMTP, render or validate HTML/AMP, create working unsubscribe links, or send email. The daily cap is enforced for previews. The Start button creates a local preview run, not a delivery job.

## Requirements

- Node.js 20 or newer
- MongoDB Community Server (optional; without it, data is kept in memory)

## Setup

1. Open a terminal in this project folder.
2. Install dependencies:

   ```powershell
   npm install
   npm install --prefix client
   npm install --prefix server
   ```

3. To persist contacts and campaign history, copy `server/.env.example` to `server/.env` and set `MONGODB_URI`.
4. Start both apps:

   ```powershell
   npm run dev
   ```

5. Open `http://localhost:5174`.

## Deployment

- **Render API:** Create a Blueprint from `render.yaml`. Set `MONGODB_URI` to your MongoDB Atlas connection string and `CLIENT_ORIGIN` to your deployed Vercel origin. Keep the Atlas URI in Render's environment settings; do not commit it.
- **Vercel client:** Import the repository with the project root set to `client`; Vercel will use `client/vercel.json`. The production build sets `VITE_API_URL` from `client/.env.production`; update it there (or override it in Vercel's environment settings) if the Render API URL changes.
- In MongoDB Atlas, allow network access from the Render service and ensure the database user has access to the application database. Atlas is the database; it does not receive source-code pushes.

The client uses the Vite proxy locally when `VITE_API_URL` is unset. `CLIENT_ORIGIN` accepts a comma-separated list if more than one browser origin is needed.

## Contact CSV format

Use columns `email`, `name`, `opted_in`, and `consent_source`, or map equivalent column names in the import panel. Only contacts with the mapped opt-in value set to `true`, `yes`, `1`, `opted-in`, or `subscribed` are eligible for preview. Other rows remain visible as excluded. Campaign preview history is available from the left sidebar when the API is running.

```csv
email,name,opted_in,consent_source
hello@example.com,Alex Morgan,true,Website signup
```

The app includes sample data so you can explore the interface before importing a list.
