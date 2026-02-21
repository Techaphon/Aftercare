import Database from 'better-sqlite3';

const db = new Database('aftercare.db');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    condition TEXT NOT NULL,
    risk_level TEXT DEFAULT 'Low', -- Low, Medium, High
    care_package TEXT DEFAULT 'Standard', -- Standard, Intensive, Post-Surgery
    admission_date TEXT,
    discharge_date TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS health_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    heart_rate INTEGER,
    systolic_bp INTEGER,
    diastolic_bp INTEGER,
    temperature REAL,
    symptoms TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients (id)
  );

  CREATE TABLE IF NOT EXISTS wound_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    image_data TEXT NOT NULL, -- Base64 string
    analysis_result TEXT, -- JSON string from AI
    risk_level TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients (id)
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- Emergency, MissedMedication, AbnormalVitals
    message TEXT,
    status TEXT DEFAULT 'Active', -- Active, Resolved
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients (id)
  );

  CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    schedule TEXT NOT NULL,
    FOREIGN KEY (patient_id) REFERENCES patients (id)
  );
`);

// Seed some initial data if empty
const stmt = db.prepare('SELECT count(*) as count FROM patients');
const result = stmt.get() as { count: number };

if (result.count === 0) {
  const insertPatient = db.prepare(`
    INSERT INTO patients (name, age, condition, risk_level, care_package, admission_date, discharge_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertPatient.run('Somchai Jai-dee', 68, 'Hypertension', 'Medium', 'Standard', '2023-10-01', '2023-10-15');
  insertPatient.run('Malee Srisuk', 72, 'Type 2 Diabetes', 'High', 'Intensive', '2023-10-05', '2023-10-20');
  insertPatient.run('Arthit Sun', 45, 'Post-Surgery (Appendicitis)', 'Low', 'Post-Surgery', '2023-10-10', '2023-10-12');
  
  const insertMed = db.prepare(`
    INSERT INTO medications (patient_id, name, dosage, schedule)
    VALUES (?, ?, ?, ?)
  `);
  
  insertMed.run(1, 'Amlodipine', '5mg', 'Morning');
  insertMed.run(2, 'Metformin', '500mg', 'After meals');
  insertMed.run(3, 'Paracetamol', '500mg', 'Every 4-6 hours for pain');
}

export default db;
