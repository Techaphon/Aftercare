# AfterCare+ SystemX

An intelligent digital health platform for post-discharge patient monitoring and AI risk screening.

## Features

- **Patient Portal**:
  - Simple, elderly-friendly interface.
  - Log vitals (Heart Rate, BP, Temperature).
  - View medications.
  - **SOS Emergency Alert** button.

- **Hospital Dashboard**:
  - Real-time patient monitoring.
  - **AI Risk Screening**: Automatically analyzes patient logs using Gemini to determine risk levels (Low, Medium, High).
  - Real-time alerts via WebSockets.
  - Visual charts for health trends.

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Recharts, Framer Motion (motion/react).
- **Backend**: Express, WebSocket (ws), Better-SQLite3.
- **AI**: Google Gemini API.

## Setup

1.  **Install Dependencies**: `npm install`
2.  **Environment Variables**: Ensure `GEMINI_API_KEY` is set in `.env` or the environment.
3.  **Run**: `npm run dev`
4.  **Open**: `http://localhost:3000`

## Usage

1.  Open the app.
2.  **Patient View**: Go to "Patient Access" -> Select a patient (e.g., Somchai).
    - Log some vitals. Try high values (e.g., HR > 100, BP > 140/90) to trigger AI risk analysis.
    - Click "Emergency SOS" to test real-time alerts.
3.  **Hospital View**: Open "Hospital Dashboard" in a separate tab or window.
    - Watch for incoming alerts and risk level updates in real-time.
