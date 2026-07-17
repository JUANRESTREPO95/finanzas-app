const express = require('express');
const router = express.Router();
const db = require('./tarjetas-database');

function ahoraFecha() {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`;
}

function ahoraHora() {
  const ahora = new Date();
  return `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
}

// ===== UTILIDADES FINANCIERAS =====
function calcularTasaAnual(tasaMensual) {
  return (Math.pow(1 + tasaMensual / 100, 12) - 1) * 100;
}

function calcularTasaMensual(tasaAnual) {
  return (Math.pow(1 + tasaAnual / 100, 1 / 12) - 1) * 100;
}

function calcularCuota(monto, tasaMensual, cuotas) {
  const i = tasaMensual / 100;
  if (i === 0) return { cuota: monto / cuotas, total: monto, intereses: 0 };
  const cuota = monto * (i * Math.pow(1 + i, cuotas)) / (Math.pow(1 + i, cuotas) - 1);
  const total = cuota * cuotas;
  const intereses = total - monto;
  return { cuota, total, intereses };
}

// ===== TARJETAS =====
router.get('/', (req, res) => {
  const tarjetas = db.prepare('SELECT * FROM tarjetas ORDER BY creado_at DESC').all();
  res.json(tarjetas);
});

router.post('/', (req, res) => {
  const {
    nombre, franquicia, cupoTotal, deudaActual, tasaMensual, tasaAnual,
    pagoMinimoPorcentaje, pagoMinimoMonto, diaCorte, diaPago, color
  } = req.body;

  if (!nombre || !cupoTotal) return res.json({ success: false, message: 'Faltan datos' });

  let tm = parseFloat(tasaMensual || 0);
  let ta = parseFloat(tasaAnual || 0);
  if (tm && !ta) ta = calcularTasaAnual(tm);
  if (ta && !tm) tm = calcularTasaMensual(ta);

  const cm = parseFloat((req.body.cuotaManejo || '0').toString().replace(',', '.')) || 0;

  const info = db.prepare(`INSERT INTO tarjetas
    (nombre, franquicia, cupo_total, deuda_actual, tasa_mensual, tasa_anual,
     pago_minimo_porcentaje, pago_minimo_monto, dia_corte, dia_pago, cuota_manejo, color)
    VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)`).run(
    nombre.toUpperCase(), (franquicia || '').toUpperCase(), parseFloat(cupoTotal),
    parseFloat(deudaActual || 0), tm, ta,
    diaCorte ? parseInt(diaCorte) : null,
    diaPago ? parseInt(diaPago) : null, cm, color || '#4361ee'
  );

  res.json({ success: true, id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const {
    nombre, franquicia, cupoTotal, deudaActual, tasaMensual, tasaAnual,
    pagoMinimoPorcentaje, pagoMinimoMonto, diaCorte, diaPago, color
  } = req.body;

  let tm = parseFloat(tasaMensual || 0);
  let ta = parseFloat(tasaAnual || 0);
  if (tm && !ta) ta = calcularTasaAnual(tm);
  if (ta && !tm) tm = calcularTasaMensual(ta);

  const cm = parseFloat((req.body.cuotaManejo || '0').toString().replace(',', '.')) || 0;

  db.prepare(`UPDATE tarjetas SET
    nombre=?, franquicia=?, cupo_total=?, deuda_actual=?, tasa_mensual=?, tasa_anual=?,
    pago_minimo_porcentaje=0, pago_minimo_monto=NULL, dia_corte=?, dia_pago=?, cuota_manejo=?, color=?
    WHERE id=?`).run(
    nombre.toUpperCase(), (franquicia || '').toUpperCase(), parseFloat(cupoTotal),
    parseFloat(deudaActual || 0), tm, ta,
    diaCorte ? parseInt(diaCorte) : null,
    diaPago ? parseInt(diaPago) : null, cm, color || '#4361ee', parseInt(id)
  );

  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tarjetas WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

// ===== RESUMEN =====
function calcularPagoMinimo(tarjetaId) {
  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(tarjetaId);
  const compras = db.prepare("SELECT * FROM compras WHERE tarjeta_id = ? AND estado != 'FINALIZADA'").all(tarjetaId);
  let pagoMinimoCompras = 0;
  compras.forEach(c => {
    let cuota = c.cuota_mensual;
    if (cuota == null) {
      if (c.sin_interes || c.cuotas <= 1) {
        cuota = parseFloat(c.monto);
      } else if (tarjeta) {
        const resultado = calcularCuota(parseFloat(c.monto), tarjeta.tasa_mensual, parseInt(c.cuotas));
        cuota = resultado.cuota;
      } else {
        cuota = parseFloat(c.monto) / parseInt(c.cuotas);
      }
    }
    pagoMinimoCompras += cuota;
  });
  const cuotaManejo = tarjeta ? (tarjeta.cuota_manejo || 0) : 0;
  return pagoMinimoCompras + cuotaManejo;
}

router.get('/resumen', (req, res) => {
  const tarjetas = db.prepare('SELECT * FROM tarjetas').all();
  const compras = db.prepare("SELECT * FROM compras WHERE estado != 'FINALIZADA'").all();
  let cupoTotal = 0;
  let deudaTotal = 0;
  let pagoMinimoTotal = 0;

  tarjetas.forEach(t => {
    cupoTotal += t.cupo_total;
    deudaTotal += t.deuda_actual;
    let pagoMinimo = 0;
    if (t.pago_minimo_monto) {
      pagoMinimo = t.pago_minimo_monto;
    } else {
      pagoMinimo = calcularPagoMinimo(t.id);
    }
    t.pago_minimo = pagoMinimo;
    pagoMinimoTotal += pagoMinimo;
  });

  res.json({
    cupoTotal,
    deudaTotal,
    disponible: cupoTotal - deudaTotal,
    pagoMinimoTotal,
    comprasActivas: compras.reduce((sum, c) => sum + c.monto, 0),
    tarjetas
  });
});

// ===== COMPRAS =====
router.get('/compras/:tarjeta_id', (req, res) => {
  const compras = db.prepare('SELECT * FROM compras WHERE tarjeta_id = ? ORDER BY creado_at DESC').all(parseInt(req.params.tarjeta_id));
  res.json(compras);
});

router.post('/compras', (req, res) => {
  const { tarjetaId, nombre, descripcion, monto, cuotas, fecha, sinInteres } = req.body;
  if (!tarjetaId || !nombre || !monto) return res.json({ success: false, message: 'Faltan datos' });

  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(parseInt(tarjetaId));
  const numCuotas = Math.max(1, parseInt(cuotas || 1));
  const esSinInteres = sinInteres || numCuotas === 1;
  let cuotaMensual = null;
  let totalIntereses = null;

  if (tarjeta && !esSinInteres && numCuotas > 1) {
    const resultado = calcularCuota(parseFloat(monto), tarjeta.tasa_mensual, numCuotas);
    cuotaMensual = resultado.cuota;
    totalIntereses = resultado.intereses;
  } else if (!esSinInteres && numCuotas > 1) {
    cuotaMensual = parseFloat(monto) / numCuotas;
    totalIntereses = 0;
  } else {
    // 1 cuota o sin intereses: la cuota mensual es el monto total
    cuotaMensual = parseFloat(monto);
    totalIntereses = 0;
  }

  const info = db.prepare(`INSERT INTO compras
    (tarjeta_id, nombre, descripcion, monto, cuotas, cuota_actual, cuota_mensual, total_intereses, sin_interes, fecha)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    parseInt(tarjetaId), nombre, descripcion || '', parseFloat(monto), numCuotas, 1,
    cuotaMensual, totalIntereses, esSinInteres ? 1 : 0, fecha || ahoraFecha()
  );

  // Aumentar deuda de la tarjeta
  if (tarjeta) {
    db.prepare('UPDATE tarjetas SET deuda_actual = ? WHERE id = ?')
      .run(tarjeta.deuda_actual + parseFloat(monto), parseInt(tarjetaId));
  }

  res.json({ success: true, id: info.lastInsertRowid, cuotaMensual, totalIntereses, sinInteres: esSinInteres });
});

router.post('/compras/:id/avanzar', (req, res) => {
  const compra = db.prepare('SELECT * FROM compras WHERE id = ?').get(parseInt(req.params.id));
  if (!compra) return res.json({ success: false, message: 'No encontrada' });
  if (compra.cuota_actual >= compra.cuotas) {
    db.prepare('UPDATE compras SET estado = ?, cuota_actual = ? WHERE id = ?')
      .run('FINALIZADA', compra.cuotas, compra.id);
  } else {
    db.prepare('UPDATE compras SET cuota_actual = cuota_actual + 1 WHERE id = ?').run(compra.id);
  }
  res.json({ success: true });
});

router.delete('/compras/:id', (req, res) => {
  const compra = db.prepare('SELECT * FROM compras WHERE id = ?').get(parseInt(req.params.id));
  if (compra && compra.estado !== 'FINALIZADA') {
    const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(compra.tarjeta_id);
    if (tarjeta) {
      db.prepare('UPDATE tarjetas SET deuda_actual = ? WHERE id = ?')
        .run(Math.max(0, tarjeta.deuda_actual - compra.monto), tarjeta.id);
    }
  }
  db.prepare('DELETE FROM compras WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

// ===== PAGOS =====
router.get('/pagos/:tarjeta_id', (req, res) => {
  const pagos = db.prepare('SELECT * FROM pagos WHERE tarjeta_id = ? ORDER BY creado_at DESC').all(parseInt(req.params.tarjeta_id));
  res.json(pagos);
});

router.post('/pagos', (req, res) => {
  const { tarjetaId, monto, tipo, fecha, nota } = req.body;
  if (!tarjetaId || !monto) return res.json({ success: false, message: 'Faltan datos' });

  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(parseInt(tarjetaId));
  if (!tarjeta) return res.json({ success: false, message: 'Tarjeta no encontrada' });

  db.prepare('INSERT INTO pagos (tarjeta_id, monto, tipo, fecha, nota) VALUES (?, ?, ?, ?, ?)')
    .run(parseInt(tarjetaId), parseFloat(monto), tipo || 'OTRO', fecha || ahoraFecha(), nota || '');

  db.prepare('UPDATE tarjetas SET deuda_actual = ? WHERE id = ?')
    .run(Math.max(0, tarjeta.deuda_actual - parseFloat(monto)), tarjeta.id);

  res.json({ success: true });
});

// ===== SIMULACIONES =====
router.get('/simulaciones', (req, res) => {
  const sims = db.prepare('SELECT s.*, t.nombre as tarjeta_nombre FROM simulaciones s LEFT JOIN tarjetas t ON s.tarjeta_id = t.id ORDER BY s.creado_at DESC').all();
  res.json(sims);
});

router.post('/simular', (req, res) => {
  const { tarjetaId, monto, cuotas } = req.body;
  if (!tarjetaId || !monto || !cuotas) return res.json({ success: false, message: 'Faltan datos' });

  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(parseInt(tarjetaId));
  if (!tarjeta) return res.json({ success: false, message: 'Tarjeta no encontrada' });

  const resultado = calcularCuota(parseFloat(monto), tarjeta.tasa_mensual, parseInt(cuotas));
  res.json({
    success: true,
    tarjetaNombre: tarjeta.nombre,
    tasaMensual: tarjeta.tasa_mensual,
    tasaAnual: tarjeta.tasa_anual,
    monto: parseFloat(monto),
    cuotas: parseInt(cuotas),
    cuotaMensual: resultado.cuota,
    totalPagado: resultado.total,
    totalIntereses: resultado.intereses
  });
});

router.post('/simulaciones', (req, res) => {
  const { nombre, tarjetaId, monto, cuotas } = req.body;
  if (!nombre || !tarjetaId || !monto || !cuotas) return res.json({ success: false, message: 'Faltan datos' });

  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(parseInt(tarjetaId));
  if (!tarjeta) return res.json({ success: false, message: 'Tarjeta no encontrada' });

  const resultado = calcularCuota(parseFloat(monto), tarjeta.tasa_mensual, parseInt(cuotas));
  const info = db.prepare(`INSERT INTO simulaciones
    (nombre, tarjeta_id, monto, cuotas, tasa_mensual, cuota_mensual, total_pagado, total_intereses)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    nombre, parseInt(tarjetaId), parseFloat(monto), parseInt(cuotas),
    tarjeta.tasa_mensual, resultado.cuota, resultado.total, resultado.intereses
  );

  res.json({ success: true, id: info.lastInsertRowid, ...resultado });
});

router.post('/simulaciones/:id/finalizar', (req, res) => {
  const sim = db.prepare('SELECT * FROM simulaciones WHERE id = ?').get(parseInt(req.params.id));
  if (!sim) return res.json({ success: false, message: 'No encontrada' });

  // Crear compra real
  const info = db.prepare(`INSERT INTO compras
    (tarjeta_id, nombre, descripcion, monto, cuotas, cuota_actual, fecha)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    sim.tarjeta_id, sim.nombre, 'De simulación', sim.monto, sim.cuotas, 1, ahoraFecha()
  );

  // Aumentar deuda
  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(sim.tarjeta_id);
  if (tarjeta) {
    db.prepare('UPDATE tarjetas SET deuda_actual = ? WHERE id = ?')
      .run(tarjeta.deuda_actual + sim.monto, sim.tarjeta_id);
  }

  // Marcar simulación como finalizada
  db.prepare('UPDATE simulaciones SET estado = ? WHERE id = ?').run('FINALIZADA', sim.id);

  res.json({ success: true, compraId: info.lastInsertRowid });
});

router.delete('/simulaciones/:id', (req, res) => {
  db.prepare('DELETE FROM simulaciones WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

module.exports = router;
