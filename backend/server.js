const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ========== CUENTAS ==========
app.get('/api/cuentas', (req, res) => {
  const cuentas = db.prepare('SELECT nombre FROM cuentas').all();
  res.json(cuentas.map(c => c.nombre));
});

app.post('/api/cuentas', (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.json({ success: false, message: 'Falta el nombre' });
  try {
    db.prepare('INSERT INTO cuentas (nombre) VALUES (?)').run(nombre.toUpperCase());
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: 'Ya existe esa cuenta' });
  }
});

// ========== CATEGORIAS ==========
app.get('/api/categorias', (req, res) => {
  const ingresos = db.prepare("SELECT nombre FROM categorias WHERE tipo = 'ingreso'").all().map(c => c.nombre);
  const salidas = db.prepare("SELECT nombre FROM categorias WHERE tipo = 'salida'").all().map(c => c.nombre);
  const subcategorias = db.prepare('SELECT nombre, categoria FROM subcategorias').all();
  res.json({ ingresos, salidas, subcategorias });
});

// ========== TOTALES ==========
app.get('/api/totales', (req, res) => {
  const cuentas = db.prepare('SELECT nombre FROM cuentas').all().map(c => c.nombre);
  const totales = {};
  cuentas.forEach(c => totales[c] = 0);

  const ingresos = db.prepare('SELECT monto, cuenta FROM ingresos').all();
  ingresos.forEach(i => {
    if (totales.hasOwnProperty(i.cuenta)) totales[i.cuenta] += i.monto;
  });

  const salidas = db.prepare('SELECT monto, cuenta FROM salidas').all();
  salidas.forEach(s => {
    if (totales.hasOwnProperty(s.cuenta)) totales[s.cuenta] -= s.monto;
  });

  res.json(totales);
});

app.get('/api/totales/sin-ahorros', (req, res) => {
  const totalesRes = {};
  const cuentas = db.prepare('SELECT nombre FROM cuentas').all().map(c => c.nombre);
  cuentas.forEach(c => totalesRes[c] = 0);

  db.prepare('SELECT monto, cuenta FROM ingresos').all()
    .forEach(i => { if (totalesRes.hasOwnProperty(i.cuenta)) totalesRes[i.cuenta] += i.monto; });
  db.prepare('SELECT monto, cuenta FROM salidas').all()
    .forEach(s => { if (totalesRes.hasOwnProperty(s.cuenta)) totalesRes[s.cuenta] -= s.monto; });

  let total = 0;
  for (let cuenta in totalesRes) {
    if (cuenta.toUpperCase() !== 'AHORROS') total += totalesRes[cuenta];
  }
  res.json({ total });
});

// ========== INGRESOS ==========
app.post('/api/ingresos', (req, res) => {
  const { fecha, hora, descripcion, categoria, monto, cuenta } = req.body;
  if (!descripcion || !monto || !cuenta) return res.json({ success: false, message: 'Faltan datos' });
  const fechaHora = `${fecha} ${hora}`;
  db.prepare('INSERT INTO ingresos (fecha_hora, descripcion, categoria, monto, cuenta) VALUES (?, ?, ?, ?, ?)')
    .run(fechaHora, descripcion, categoria, parseFloat(monto), cuenta);
  res.json({ success: true });
});

// ========== SALIDAS ==========
app.post('/api/salidas', (req, res) => {
  const { fecha, hora, descripcion, categoria, subcategoria, monto, cuenta } = req.body;
  if (!descripcion || !monto || !cuenta) return res.json({ success: false, message: 'Faltan datos' });
  const fechaHora = `${fecha} ${hora}`;
  db.prepare('INSERT INTO salidas (fecha_hora, descripcion, categoria, subcategoria, monto, cuenta) VALUES (?, ?, ?, ?, ?, ?)')
    .run(fechaHora, descripcion, categoria, subcategoria || '', parseFloat(monto), cuenta);
  res.json({ success: true });
});

// ========== MOVIMIENTOS ==========
app.get('/api/movimientos', (req, res) => {
  const ingresos = db.prepare("SELECT *, 'INGRESO' as tipo FROM ingresos").all();
  const salidas = db.prepare("SELECT *, 'SALIDA' as tipo FROM salidas").all();

  const movimientos = [
    ...ingresos.map(i => ({
      fechaHora: i.fecha_hora,
      tipo: 'INGRESO',
      monto: i.monto,
      detalle: i.descripcion,
      cuenta: i.cuenta,
      categoria: i.categoria,
      id: i.id
    })),
    ...salidas.map(s => ({
      fechaHora: s.fecha_hora,
      tipo: 'SALIDA',
      monto: s.monto,
      detalle: s.descripcion,
      cuenta: s.cuenta,
      categoria: s.categoria,
      subcategoria: s.subcategoria,
      id: s.id
    }))
  ];

  movimientos.sort((a, b) => new Date(b.fechaHora) - new Date(a.fechaHora));
  res.json(movimientos);
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
  const { fecha, hora, descripcion, categoria, subcategoria, monto, cuenta } = req.body;
  const fechaHora = `${fecha} ${hora}`;

  if (tipo === 'INGRESO') {
    db.prepare('UPDATE ingresos SET fecha_hora=?, descripcion=?, categoria=?, monto=?, cuenta=? WHERE id=?')
      .run(fechaHora, descripcion, categoria, parseFloat(monto), cuenta, parseInt(id));
  } else {
    db.prepare('UPDATE salidas SET fecha_hora=?, descripcion=?, categoria=?, subcategoria=?, monto=?, cuenta=? WHERE id=?')
      .run(fechaHora, descripcion, categoria, subcategoria || '', parseFloat(monto), cuenta, parseInt(id));
  }
  res.json({ success: true });
});

// ========== TRANSFERENCIA ==========
app.post('/api/transferencia', (req, res) => {
  const { cuentaOrigen, cuentaDestino, monto, descripcion } = req.body;
  if (cuentaOrigen === cuentaDestino) return res.json({ success: false, message: 'Cuentas iguales' });
  const fechaHora = new Date().toISOString();
  const desc = descripcion || 'Transferencia';

  db.prepare('INSERT INTO salidas (fecha_hora, descripcion, categoria, subcategoria, monto, cuenta) VALUES (?, ?, ?, ?, ?, ?)')
    .run(fechaHora, desc, 'TRANSFERENCIA', `Transferencia a ${cuentaDestino}`, parseFloat(monto), cuentaOrigen);

  db.prepare('INSERT INTO ingresos (fecha_hora, descripcion, categoria, monto, cuenta) VALUES (?, ?, ?, ?, ?)')
    .run(fechaHora, desc, 'TRANSFERENCIA', parseFloat(monto), cuentaDestino);

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

app.post('/api/pendientes', (req, res) => {
  const { fecha, descripcion, montoMensual, categoria } = req.body;
  if (!descripcion || !montoMensual) return res.json({ success: false, message: 'Faltan datos' });
  db.prepare('INSERT INTO pendientes (fecha, descripcion, monto_mensual, abono, restante, pagado, categoria) VALUES (?, ?, ?, 0, ?, ?, ?)')
    .run(fecha, descripcion, parseFloat(montoMensual), parseFloat(montoMensual), '', categoria || '');
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

// ========== INICIO ==========
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});