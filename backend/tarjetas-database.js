const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'tarjetas.db');
const db = new Database(DB_PATH);

// db.pragma('journal_mode = WAL');

function inicializar() {
  // Migraciones suaves para columnas nuevas
  try { db.exec('ALTER TABLE compras ADD COLUMN cuota_mensual REAL'); } catch(e){}
  try { db.exec('ALTER TABLE compras ADD COLUMN total_intereses REAL'); } catch(e){}
  try { db.exec('ALTER TABLE compras ADD COLUMN sin_interes INTEGER NOT NULL DEFAULT 0'); } catch(e){}
  try { db.exec('ALTER TABLE tarjetas ADD COLUMN cuota_manejo REAL NOT NULL DEFAULT 0'); } catch(e){}

  db.exec(`
    CREATE TABLE IF NOT EXISTS tarjetas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      franquicia TEXT,
      cupo_total REAL NOT NULL DEFAULT 0,
      deuda_actual REAL NOT NULL DEFAULT 0,
      tasa_mensual REAL NOT NULL DEFAULT 0,
      tasa_anual REAL NOT NULL DEFAULT 0,
      pago_minimo_porcentaje REAL NOT NULL DEFAULT 0,
      pago_minimo_monto REAL,
      dia_corte INTEGER,
      dia_pago INTEGER,
      cuota_manejo REAL NOT NULL DEFAULT 0,
      color TEXT,
      creado_at INTEGER DEFAULT (CAST(strftime('%s', 'now') AS INTEGER))
    );

    CREATE TABLE IF NOT EXISTS compras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tarjeta_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      monto REAL NOT NULL,
      cuotas INTEGER NOT NULL DEFAULT 1,
      cuota_actual INTEGER NOT NULL DEFAULT 1,
      cuota_mensual REAL,
      total_intereses REAL,
      sin_interes INTEGER NOT NULL DEFAULT 0,
      fecha TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'ACTIVA',
      creado_at INTEGER DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
      FOREIGN KEY (tarjeta_id) REFERENCES tarjetas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tarjeta_id INTEGER NOT NULL,
      monto REAL NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'OTRO',
      fecha TEXT NOT NULL,
      nota TEXT,
      creado_at INTEGER DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
      FOREIGN KEY (tarjeta_id) REFERENCES tarjetas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS simulaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      tarjeta_id INTEGER,
      monto REAL NOT NULL,
      cuotas INTEGER NOT NULL,
      tasa_mensual REAL NOT NULL,
      cuota_mensual REAL NOT NULL,
      total_pagado REAL NOT NULL,
      total_intereses REAL NOT NULL,
      estado TEXT NOT NULL DEFAULT 'PENDIENTE',
      creado_at INTEGER DEFAULT (CAST(strftime('%s', 'now') AS INTEGER))
    );
  `);

  // Asegurar que compras antiguas de 1 cuota tengan cuota_mensual
  db.prepare(`UPDATE compras SET cuota_mensual = monto, total_intereses = 0 WHERE cuotas = 1 AND cuota_mensual IS NULL`).run();
  db.prepare(`UPDATE compras SET cuota_mensual = monto / cuotas, total_intereses = 0 WHERE sin_interes = 1 AND cuota_mensual IS NULL`).run();
}

inicializar();

module.exports = db;
