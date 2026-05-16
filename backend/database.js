const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'finanzas.db'));

// Crear tablas si no existen
db.exec(`
  CREATE TABLE IF NOT EXISTS ingresos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_hora TEXT NOT NULL,
    descripcion TEXT,
    categoria TEXT,
    monto REAL NOT NULL,
    cuenta TEXT NOT NULL,
    created_at INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS salidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_hora TEXT NOT NULL,
    descripcion TEXT,
    monto REAL NOT NULL,
    cuenta TEXT NOT NULL,
    created_at INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS pendientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT,
    descripcion TEXT NOT NULL,
    monto_mensual REAL NOT NULL,
    abono REAL DEFAULT 0,
    restante REAL,
    pagado TEXT DEFAULT '',
    categoria TEXT
  );



  CREATE TABLE IF NOT EXISTS cuentas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
  );
`);

// Insertar cuentas por defecto si no existen
const cuentasExistentes = db.prepare('SELECT COUNT(*) as total FROM cuentas').get();
if (cuentasExistentes.total === 0) {
  db.prepare('INSERT INTO cuentas (nombre) VALUES (?)').run('BANCOLOMBIA');
  db.prepare('INSERT INTO cuentas (nombre) VALUES (?)').run('EFECTIVO');
  db.prepare('INSERT INTO cuentas (nombre) VALUES (?)').run('AHORROS');
}

module.exports = db;