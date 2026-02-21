import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import * as path from "path";
import db from "./db";
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/api/ws' });

  app.use(express.json({ limit: '50mb' }));

  // WebSocket Connection
  wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('close', () => console.log('Client disconnected'));
  });

  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  // API Routes

  // Get all patients
  app.get("/api/patients", (req, res) => {
    const patients = db.prepare('SELECT * FROM patients').all();
    res.json(patients);
  });

  // Get single patient details
  app.get("/api/patients/:id", (req, res) => {
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
    const logs = db.prepare('SELECT * FROM health_logs WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 20').all(req.params.id);
    const woundLogs = db.prepare('SELECT * FROM wound_logs WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 10').all(req.params.id);
    const meds = db.prepare('SELECT * FROM medications WHERE patient_id = ?').all(req.params.id);
    const alerts = db.prepare('SELECT * FROM alerts WHERE patient_id = ? ORDER BY timestamp DESC').all(req.params.id);
    
    res.json({ patient, logs, woundLogs, meds, alerts });
  });

  // Submit Health Log & AI Analysis
  app.post("/api/logs", async (req, res) => {
    const { patient_id, heart_rate, systolic_bp, diastolic_bp, temperature, symptoms } = req.body;
    
    // 1. Save Log
    const insert = db.prepare(`
      INSERT INTO health_logs (patient_id, heart_rate, systolic_bp, diastolic_bp, temperature, symptoms)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insert.run(patient_id, heart_rate, systolic_bp, diastolic_bp, temperature, symptoms);

    // 2. AI Risk Analysis
    try {
      const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patient_id) as any;
      const prompt = `
        Analyze the health risk for this patient based on new vitals.
        Patient: ${patient.name}, Age: ${patient.age}, Condition: ${patient.condition}.
        New Vitals: Heart Rate ${heart_rate}, BP ${systolic_bp}/${diastolic_bp}, Temp ${temperature}, Symptoms: ${symptoms}.
        
        Return a JSON object with:
        - risk_level: "Low", "Medium", or "High"
        - reason: Short explanation.
        - alert_needed: boolean (true if immediate medical attention needed)
      `;

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const analysis = JSON.parse(result.text || "{}");
      
      // Update Patient Risk Level
      db.prepare('UPDATE patients SET risk_level = ? WHERE id = ?').run(analysis.risk_level, patient_id);

      // Create Alert if needed
      if (analysis.alert_needed) {
        db.prepare('INSERT INTO alerts (patient_id, type, message) VALUES (?, ?, ?)').run(patient_id, 'AbnormalVitals', analysis.reason);
        broadcast({ type: 'NEW_ALERT', patient_id, message: analysis.reason });
      }

      broadcast({ type: 'UPDATE_PATIENT', patient_id });
      
      res.json({ success: true, analysis });
    } catch (error) {
      console.error("AI Error:", error);
      res.json({ success: true, warning: "AI analysis failed, but log saved." });
    }
  });

  // Analyze Wound Image
  app.post("/api/analyze-wound", async (req, res) => {
    const { patient_id, image_data } = req.body;

    try {
      // Remove header from base64 if present
      const base64Data = image_data.split(',')[1] || image_data;

      const prompt = `
        You are a medical AI assistant. Analyze this wound image for signs of infection (redness, swelling, pus, necrosis).
        
        Return a JSON object with:
        - risk_level: "Low", "Medium", or "High"
        - analysis: Detailed observation of the wound.
        - advice: Care advice for the patient.
        - alert_needed: boolean (true if High risk)
      `;

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { text: prompt },
          { inlineData: { mimeType: "image/jpeg", data: base64Data } }
        ],
        config: { responseMimeType: "application/json" }
      });

      const analysis = JSON.parse(result.text || "{}");
      
      // Save to DB
      const insert = db.prepare(`
        INSERT INTO wound_logs (patient_id, image_data, analysis_result, risk_level)
        VALUES (?, ?, ?, ?)
      `);
      insert.run(patient_id, image_data, JSON.stringify(analysis), analysis.risk_level);

      // Create Alert if needed
      if (analysis.alert_needed || analysis.risk_level === 'High') {
        db.prepare('INSERT INTO alerts (patient_id, type, message) VALUES (?, ?, ?)').run(patient_id, 'WoundInfectionRisk', `High Risk Wound Detected: ${analysis.analysis}`);
        broadcast({ type: 'NEW_ALERT', patient_id, message: `Wound Risk: ${analysis.analysis}` });
        
        // Update patient risk level to High if wound is bad
        db.prepare('UPDATE patients SET risk_level = "High" WHERE id = ?').run(patient_id);
        broadcast({ type: 'UPDATE_PATIENT', patient_id });
      }

      res.json({ success: true, analysis });
    } catch (error) {
      console.error("Wound AI Error:", error);
      res.status(500).json({ error: "Failed to analyze wound image." });
    }
  });

  // Trigger Emergency Alert
  app.post("/api/emergency", (req, res) => {
    const { patient_id } = req.body;
    const patient = db.prepare('SELECT name FROM patients WHERE id = ?').get(patient_id) as any;
    
    db.prepare('INSERT INTO alerts (patient_id, type, message) VALUES (?, ?, ?)').run(patient_id, 'Emergency', `Patient ${patient.name} triggered SOS!`);
    
    broadcast({ type: 'EMERGENCY', patient_id, message: `SOS: ${patient.name}` });
    res.json({ success: true });
  });

  // Resolve Alert
  app.post("/api/alerts/:id/resolve", (req, res) => {
    db.prepare('UPDATE alerts SET status = "Resolved" WHERE id = ?').run(req.params.id);
    broadcast({ type: 'ALERT_RESOLVED', id: req.params.id });
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    
    // SPA fallback
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
