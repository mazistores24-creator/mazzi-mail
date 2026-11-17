# Mazzi Mail — Step-by-step guide

This is a separate standalone project from Mazzi Extractor. Its Vite/React client and Express API run locally; MongoDB is optional for saved contacts and campaign previews.

## 1. Requirements

- Node.js 20 or newer
- MongoDB Community Server only if you want contacts and preview history to persist between server restarts

## 2. Install dependencies

Open PowerShell in the `mazzi-mail` project folder and run:

```powershell
npm ci
npm ci --prefix client
npm ci --prefix server
```

## 3. Optional: configure MongoDB

To persist contacts and campaign preview history, copy `server/.env.example` to `server/.env` and set `MONGODB_URI`. If you skip this, the app uses temporary in-memory storage.

## 4. Start the app

From the project root, run:

```powershell
npm run dev
```

Open **http://localhost:5174**. The API runs on **http://localhost:5001**.

## 5. Import contacts

1. Choose or drop a CSV file on the Import screen.
2. Map the email, name, opt-in, and consent-source columns.
3. Confirm the import. Contacts without an affirmative opt-in value are excluded from previews.

## 6. Create a message preview

1. Open **Message**, enter a subject and body, then choose a format label.
2. Personalization placeholders include `{{name}}`, `%FNAME%`, and `%EMAIL%`.
3. Open **Configure** to set sender details and the preview cap.
4. Select **Start preview**. Open **Campaign history** in the sidebar to see saved preview runs.

## Scope

Mazzi Mail is preview-only: it does not connect to an email provider or send messages. HTML/AMP content is not rendered or validated, and unsubscribe placeholders are not live links.
