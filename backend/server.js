const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const tarjetasRoutes = require('./tarjetas-routes');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

app.use('/api/tarjetas', tarjetasRoutes);

// ========== CUENTAS ==========
app.get('/api/cuentas', (req, res) => {
  const cuentas = db.prepare('SELECT nombre, incluir_en_total FROM cuentas').all();
  res.json(cuentas);
});

app.post('/api/cuentas', (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.json({ success: false, message: 'Falta el nombre' });
  try {
    db.prepare('INSERT INTO cuentas (nombre, incluir_en_total) VALUES (?, 1)').run(nombre.toUpperCase());
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Ya existe esa cuenta' });
  }
});

app.delete('/api/cuentas/:nombre', (req, res) => {
  const { nombre } = req.params;
  db.prepare('DELETE FROM cuentas WHERE nombre = ?').run(nombre);
  res.json({ success: true });
});

app.put('/api/cuentas/:nombre/visible', (req, res) => {
  const { nombre } = req.params;
  const { incluir } = req.body;
  db.prepare('UPDATE cuentas SET incluir_en_total = ? WHERE nombre = ?').run(incluir ? 1 : 0, nombre);
  res.json({ success: true });
});

// ========== TOTALES ==========
function calcularTotales() {
  const cuentas = db.prepare('SELECT nombre FROM cuentas').all().map(c => c.nombre);
  const totales = {};
  cuentas.forEach(c => totales[c] = 0);

  db.prepare('SELECT monto, cuenta FROM ingresos').all()
    .forEach(i => { if (totales.hasOwnProperty(i.cuenta)) totales[i.cuenta] += i.monto; });
  db.prepare('SELECT monto, cuenta FROM salidas').all()
    .forEach(s => { if (totales.hasOwnProperty(s.cuenta)) totales[s.cuenta] -= s.monto; });

  return totales;
}

app.get('/api/totales', (req, res) => {
  const totales = calcularTotales();
  const cuentasVisibles = db.prepare('SELECT nombre, incluir_en_total FROM cuentas').all();
  const patrimonio = cuentasVisibles
    .filter(c => c.incluir_en_total === 1)
    .reduce((acc, c) => acc + (totales[c.nombre] || 0), 0);

  const grupos = db.prepare('SELECT * FROM grupos_cuentas').all().map(g => {
    const cuentasGrupo = JSON.parse(g.cuentas || '[]');
    const suma = cuentasGrupo.reduce((acc, c) => acc + (totales[c] || 0), 0);
    return { id: g.id, nombre: g.nombre, cuentas: cuentasGrupo, total: suma };
  });
  res.json({ patrimonio, cuentas: totales, grupos });
});

app.get('/api/totales/sin-ahorros', (req, res) => {
  const totales = calcularTotales();
  const visibles = db.prepare('SELECT nombre FROM cuentas WHERE incluir_en_total = 1').all().map(c => c.nombre);
  let total = 0;
  for (let cuenta in totales) {
    if (visibles.includes(cuenta)) total += totales[cuenta];
  }
  res.json({ total });
});

// ========== MIGRACIONES ==========
function ejecutarMigraciones() {
  try {
    db.exec(`ALTER TABLE ingresos ADD COLUMN created_at INTEGER DEFAULT 0;`);
    db.exec(`UPDATE ingresos SET created_at = CAST(strftime('%s', 'now') AS INTEGER) WHERE created_at = 0;`);
  } catch(e) {}
  try {
    db.exec(`ALTER TABLE salidas ADD COLUMN created_at INTEGER DEFAULT 0;`);
    db.exec(`UPDATE salidas SET created_at = CAST(strftime('%s', 'now') AS INTEGER) WHERE created_at = 0;`);
  } catch(e) {}
  try {
    db.exec(`ALTER TABLE cuentas ADD COLUMN incluir_en_total INTEGER DEFAULT 1;`);
    db.exec(`UPDATE cuentas SET incluir_en_total = 0 WHERE nombre = 'AHORROS' AND incluir_en_total = 1;`);
  } catch(e) {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS grupos_cuentas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      cuentas TEXT NOT NULL DEFAULT '[]'
    );`);
  } catch(e) {}
}

ejecutarMigraciones();

// ========== GRUPOS DE CUENTAS ==========
app.get('/api/grupos', (req, res) => {
  const grupos = db.prepare('SELECT * FROM grupos_cuentas').all().map(g => ({
    id: g.id,
    nombre: g.nombre,
    cuentas: JSON.parse(g.cuentas || '[]')
  }));
  res.json(grupos);
});

app.post('/api/grupos', (req, res) => {
  const { nombre, cuentas } = req.body;
  if (!nombre || !Array.isArray(cuentas)) return res.json({ success: false, message: 'Faltan datos' });
  try {
    db.prepare('INSERT INTO grupos_cuentas (nombre, cuentas) VALUES (?, ?)').run(nombre.trim().toUpperCase(), JSON.stringify(cuentas));
    res.json({ success: true });
  } catch(e) {
    res.json({ success: false, message: 'Ya existe un grupo con ese nombre' });
  }
});

app.put('/api/grupos/:id', (req, res) => {
  const { id } = req.params;
  const { nombre, cuentas } = req.body;
  if (!nombre || !Array.isArray(cuentas)) return res.json({ success: false, message: 'Faltan datos' });
  db.prepare('UPDATE grupos_cuentas SET nombre=?, cuentas=? WHERE id=?')
    .run(nombre.trim().toUpperCase(), JSON.stringify(cuentas), parseInt(id));
  res.json({ success: true });
});

app.delete('/api/grupos/:id', (req, res) => {
  db.prepare('DELETE FROM grupos_cuentas WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

// ========== INGRESOS ==========
app.post('/api/ingresos', (req, res) => {
  let { fecha, hora, descripcion, monto, cuenta } = req.body;
  if (!descripcion || !monto || !cuenta) return res.json({ success: false, message: 'Faltan datos' });
  const ahora = new Date();
  if (!fecha) {
    fecha = ahora.toISOString().split('T')[0];
  }
  if (!hora) {
    hora = ahora.toTimeString().slice(0,5);
  }
  const fechaHora = `${fecha} ${hora}`;
  const createdAt = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO ingresos (fecha_hora, descripcion, monto, cuenta, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(fechaHora, descripcion, parseFloat(monto), cuenta, createdAt);
  res.json({ success: true, fecha, hora });
});

app.delete('/api/ingresos/:id', (req, res) => {
  db.prepare('DELETE FROM ingresos WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

app.put('/api/movimientos/INGRESO/:id', (req, res) => {
  const { id } = req.params;
  const { fecha, hora, descripcion, monto, cuenta } = req.body;
  const fechaHora = `${fecha} ${hora}`;
  const createdAt = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE ingresos SET fecha_hora=?, descripcion=?, monto=?, cuenta=?, created_at=? WHERE id=?')
    .run(fechaHora, descripcion, parseFloat(monto), cuenta, createdAt, parseInt(id));
  res.json({ success: true });
});

// ========== SALIDAS ==========
app.post('/api/salidas', (req, res) => {
  let { fecha, hora, descripcion, monto, cuenta } = req.body;
  if (!descripcion || !monto || !cuenta) return res.json({ success: false, message: 'Faltan datos' });
  const ahora = new Date();
  if (!fecha) {
    fecha = ahora.toISOString().split('T')[0];
  }
  if (!hora) {
    hora = ahora.toTimeString().slice(0,5);
  }
  const fechaHora = `${fecha} ${hora}`;
  const createdAt = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO salidas (fecha_hora, descripcion, monto, cuenta, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(fechaHora, descripcion, parseFloat(monto), cuenta, createdAt);
  res.json({ success: true, fecha, hora });
});

app.delete('/api/salidas/:id', (req, res) => {
  db.prepare('DELETE FROM salidas WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

app.put('/api/movimientos/SALIDA/:id', (req, res) => {
  const { id } = req.params;
  const { fecha, hora, descripcion, monto, cuenta } = req.body;
  const fechaHora = `${fecha} ${hora}`;
  const createdAt = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE salidas SET fecha_hora=?, descripcion=?, monto=?, cuenta=?, created_at=? WHERE id=?')
    .run(fechaHora, descripcion, parseFloat(monto), cuenta, createdAt, parseInt(id));
  res.json({ success: true });
});

// ========== MOVIMIENTOS ==========
app.get('/api/movimientos', (req, res) => {
  const { mes, anio } = req.query;
  let where = '';
  let params = [];

  if (mes && anio) {
    const mesStr = String(mes).padStart(2, '0');
    where = "WHERE fecha_hora LIKE ?";
    params = [`${anio}-${mesStr}%`];
  }

  const ingresos = db.prepare(`SELECT *, 'INGRESO' as tipo FROM ingresos ${where}`).all(...params);
  const salidas = db.prepare(`SELECT *, 'SALIDA' as tipo FROM salidas ${where}`).all(...params);

  const movimientos = [
    ...ingresos.map(i => ({
      fechaHora: i.fecha_hora,
      tipo: 'INGRESO',
      monto: i.monto,
      detalle: i.descripcion,
      cuenta: i.cuenta,
      id: i.id,
      createdAt: i.created_at
    })),
    ...salidas.map(s => ({
      fechaHora: s.fecha_hora,
      tipo: 'SALIDA',
      monto: s.monto,
      detalle: s.descripcion,
      cuenta: s.cuenta,
      id: s.id,
      createdAt: s.created_at
    }))
  ];

  movimientos.sort((a, b) => b.createdAt - a.createdAt);
  res.json(movimientos);
});

// ========== TOTALES MES ACTUAL ==========
app.get('/api/resumen/mes-actual', (req, res) => {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const prefix = `${anio}-${mes}`;

  const ingresos = db.prepare("SELECT monto FROM ingresos WHERE fecha_hora LIKE ?").all(`${prefix}%`);
  const salidas = db.prepare("SELECT monto FROM salidas WHERE fecha_hora LIKE ?").all(`${prefix}%`);

  const totalIngresos = ingresos.reduce((a, i) => a + i.monto, 0);
  const totalSalidas = salidas.reduce((a, s) => a + s.monto, 0);

  res.json({ anio, mes, ingresos: totalIngresos, salidas: totalSalidas });
});

// ========== ELIMINAR MOVIMIENTO ==========
app.delete('/api/movimientos/:tipo/:id', (req, res) => {
  const { tipo, id } = req.params;
  const tabla = tipo === 'INGRESO' ? 'ingresos' : 'salidas';
  db.prepare(`DELETE FROM ${tabla} WHERE id = ?`).run(parseInt(id));
  res.json({ success: true });
});

// ========== EDITAR MOVIMIENTO ==========
app.put('/api/movimientos/:tipo/:id', (req, res) => {
  const { tipo, id } = req.params;
  const { fecha, hora, descripcion, monto, cuenta } = req.body;
  const fechaHora = `${fecha} ${hora}`;

  if (tipo === 'INGRESO') {
    db.prepare('UPDATE ingresos SET fecha_hora=?, descripcion=?, monto=?, cuenta=? WHERE id=?')
      .run(fechaHora, descripcion, parseFloat(monto), cuenta, parseInt(id));
  } else {
    db.prepare('UPDATE salidas SET fecha_hora=?, descripcion=?, monto=?, cuenta=? WHERE id=?')
      .run(fechaHora, descripcion, parseFloat(monto), cuenta, parseInt(id));
  }
  res.json({ success: true });
});

// ========== TRANSFERENCIA ==========
app.post('/api/transferencia', (req, res) => {
  const { cuentaOrigen, cuentaDestino, monto, descripcion } = req.body;
  if (cuentaOrigen === cuentaDestino) return res.json({ success: false, message: 'Cuentas iguales' });
  const fechaHora = new Date().toISOString();
  const createdAt = Math.floor(Date.now() / 1000);
  const desc = descripcion || 'Transferencia';

  db.prepare('INSERT INTO salidas (fecha_hora, descripcion, monto, cuenta, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(fechaHora, desc, parseFloat(monto), cuentaOrigen, createdAt);

  db.prepare('INSERT INTO ingresos (fecha_hora, descripcion, monto, cuenta, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(fechaHora, desc, parseFloat(monto), cuentaDestino, createdAt);

  res.json({ success: true });
});

// ========== PENDIENTES ==========
app.get('/api/pendientes', (req, res) => {
  const pendientes = db.prepare("SELECT * FROM pendientes WHERE pagado != 'OK'").all();
  const resultado = pendientes
    .filter(p => p.monto_mensual > 0)
    .map(p => ({
      id: p.id,
      fecha: p.fecha ? String(p.fecha).split('/')[0] : '—',
      descripcion: p.descripcion,
      montoMensual: p.monto_mensual,
      abono: p.abono || 0,
      faltante: p.monto_mensual - (p.abono || 0),
      categoria: p.categoria || 'Sin categoría'
    }))
    .sort((a, b) => parseInt(a.fecha) - parseInt(b.fecha));
  res.json(resultado);
});

app.post('/api/pendientes/nuevo', (req, res) => {
  const { fecha, descripcion, montoMensual, categoria } = req.body;
  if (!descripcion || !montoMensual) return res.json({ success: false, message: 'Faltan datos' });
  db.prepare("INSERT INTO pendientes (fecha, descripcion, monto_mensual, abono, restante, pagado, categoria) VALUES (?, ?, ?, 0, ?, '', ?)")
    .run(fecha || '', descripcion.toUpperCase(), parseFloat(montoMensual), parseFloat(montoMensual), categoria || '');
  res.json({ success: true });
});

app.put('/api/pendientes/abono', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.json({ success: false, message: 'Se espera un array' });
  let updatedCount = 0;
  items.forEach(item => {
    if (!item.id || !item.incrementoAbono) return;
    const p = db.prepare('SELECT * FROM pendientes WHERE id = ?').get(item.id);
    if (!p) return;
    const nuevoAbono = (p.abono || 0) + parseFloat(item.incrementoAbono);
    const restante = Math.max(p.monto_mensual - nuevoAbono, 0);
    const pagado = restante <= 0 ? 'OK' : '';
    db.prepare('UPDATE pendientes SET abono=?, restante=?, pagado=? WHERE id=?')
      .run(nuevoAbono, restante, pagado, p.id);
    updatedCount++;
  });
  res.json({ success: true, updatedCount });
});

app.post('/api/pendientes/reiniciar', (req, res) => {
  const pendientes = db.prepare('SELECT * FROM pendientes').all();
  pendientes.forEach(p => {
    db.prepare("UPDATE pendientes SET abono=0, restante=?, pagado='' WHERE id=?")
      .run(p.monto_mensual, p.id);
  });
  res.json({ success: true, message: 'Abonos reiniciados correctamente' });
});

// ========== CONFIGURACION PENDIENTES ==========

// Rutas específicas (antes de las que tienen :id)
app.get('/api/pendientes/cats', (req, res) => {
  const cats = db.prepare("SELECT DISTINCT categoria FROM pendientes WHERE categoria IS NOT NULL AND categoria != ''").all();
  res.json(cats.map(c => c.categoria));
});

app.get('/api/pendientes/all', (req, res) => {
  const pendientes = db.prepare('SELECT * FROM pendientes').all();
  const resultado = pendientes.map(p => ({
    id: p.id,
    fecha: p.fecha ? String(p.fecha).split('/')[0] : '—',
    descripcion: p.descripcion,
    montoMensual: p.monto_mensual,
    abono: p.abono || 0,
    faltante: Math.max(p.monto_mensual - (p.abono || 0), 0),
    categoria: p.categoria || 'Sin categoría',
    pagado: p.pagado || ''
  }));
  res.json(resultado);
});

// Rutas con :id AL FINAL
app.put('/api/pendientes/:id', (req, res) => {
  const { id } = req.params;
  const { fecha, descripcion, montoMensual, categoria } = req.body;
  const p = db.prepare('SELECT * FROM pendientes WHERE id = ?').get(parseInt(id));
  if (!p) return res.json({ success: false, message: 'No encontrado' });
  const nuevoRestante = Math.max(parseFloat(montoMensual) - (p.abono || 0), 0);
  const pagado = nuevoRestante <= 0 ? 'OK' : '';
  db.prepare('UPDATE pendientes SET fecha=?, descripcion=?, monto_mensual=?, restante=?, pagado=?, categoria=? WHERE id=?')
    .run(fecha, descripcion.toUpperCase(), parseFloat(montoMensual), nuevoRestante, pagado, categoria, parseInt(id));
  res.json({ success: true });
});

app.delete('/api/pendientes/categoria/:nombre', (req, res) => {
  db.prepare('DELETE FROM pendientes WHERE categoria = ?').run(req.params.nombre);
  res.json({ success: true });
});

app.delete('/api/pendientes/:id', (req, res) => {
  db.prepare('DELETE FROM pendientes WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});


// ========== INICIO ==========
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
