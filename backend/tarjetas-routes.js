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
// La deuda se guarda con 2 decimales para que sumar y restar no acumule error.
function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

// Monto válido (> 0) redondeado a 2 decimales, o null si no sirve.
function montoValido(valor) {
  const n = parseFloat(valor);
  return Number.isFinite(n) && n > 0 ? redondear(n) : null;
}

// Número de cuotas válido (entero >= 1). Si no viene, se asume 1.
function cuotasValidas(valor) {
  if (valor == null || valor === '') return 1;
  const n = parseInt(valor, 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

// ===== AJUSTES SIMPLES (clave/valor) =====
const CLAVE_DESTACADAS = 'resumen_tarjetas';

function leerAjuste(clave, porDefecto) {
  const fila = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave);
  if (!fila) return porDefecto;
  try {
    return JSON.parse(fila.valor);
  } catch (e) {
    return porDefecto;
  }
}

function guardarAjuste(clave, valor) {
  db.prepare(`INSERT INTO ajustes (clave, valor) VALUES (?, ?)
              ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`)
    .run(clave, JSON.stringify(valor));
}

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

  if (!nombre || !String(nombre).trim()) {
    return res.json({ success: false, message: 'Falta el nombre de la tarjeta' });
  }

  const cupoNum = montoValido(cupoTotal);
  if (cupoNum === null) {
    return res.json({ success: false, message: 'El cupo total debe ser mayor que cero' });
  }

  const deudaNum = parseFloat(deudaActual || 0);
  if (!Number.isFinite(deudaNum) || deudaNum < 0) {
    return res.json({ success: false, message: 'La deuda no puede ser negativa' });
  }

  let tm = parseFloat(tasaMensual || 0);
  let ta = parseFloat(tasaAnual || 0);
  if (tm && !ta) ta = calcularTasaAnual(tm);
  if (ta && !tm) tm = calcularTasaMensual(ta);

  const cm = parseFloat((req.body.cuotaManejo || '0').toString().replace(',', '.')) || 0;

  const info = db.prepare(`INSERT INTO tarjetas
    (nombre, franquicia, cupo_total, deuda_actual, tasa_mensual, tasa_anual,
     pago_minimo_porcentaje, pago_minimo_monto, dia_corte, dia_pago, cuota_manejo, color)
    VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)`).run(
    nombre.toUpperCase(), (franquicia || '').toUpperCase(), cupoNum,
    redondear(deudaNum), tm, ta,
    diaCorte ? parseInt(diaCorte) : null,
    diaPago ? parseInt(diaPago) : null, cm, color || '#4361ee'
  );

  res.json({ success: true, id: info.lastInsertRowid });
});

// ===== TARJETAS DESTACADAS EN EL RESUMEN =====
// (van antes de /:id para que Express no las tome como un id)
router.get('/destacadas', (req, res) => {
  const ids = leerAjuste(CLAVE_DESTACADAS, []);
  const tarjetas = ids
    .map(id => db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(id))
    .filter(Boolean)
    .slice(0, 2)
    .map(t => ({
      id: t.id,
      nombre: t.nombre,
      franquicia: t.franquicia,
      color: t.color,
      cupo_total: t.cupo_total,
      deuda_actual: t.deuda_actual,
      disponible: Math.max(0, redondear(t.cupo_total - t.deuda_actual))
    }));
  res.json(tarjetas);
});

router.put('/destacadas', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.json({ success: false, message: 'Faltan datos' });
  if (ids.length > 2) return res.json({ success: false, message: 'Máximo 2 tarjetas' });

  const limpios = [...new Set(ids.map(n => parseInt(n, 10)).filter(Number.isInteger))];
  for (const id of limpios) {
    if (!db.prepare('SELECT 1 FROM tarjetas WHERE id = ?').get(id)) {
      return res.json({ success: false, message: 'Tarjeta no encontrada' });
    }
  }

  guardarAjuste(CLAVE_DESTACADAS, limpios);
  res.json({ success: true, ids: limpios });
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const {
    nombre, franquicia, cupoTotal, deudaActual, tasaMensual, tasaAnual,
    pagoMinimoPorcentaje, pagoMinimoMonto, diaCorte, diaPago, color
  } = req.body;

  if (!nombre || !String(nombre).trim()) {
    return res.json({ success: false, message: 'Falta el nombre de la tarjeta' });
  }

  const cupoNum = montoValido(cupoTotal);
  if (cupoNum === null) {
    return res.json({ success: false, message: 'El cupo total debe ser mayor que cero' });
  }

  const deudaNum = parseFloat(deudaActual || 0);
  if (!Number.isFinite(deudaNum) || deudaNum < 0) {
    return res.json({ success: false, message: 'La deuda no puede ser negativa' });
  }

  let tm = parseFloat(tasaMensual || 0);
  let ta = parseFloat(tasaAnual || 0);
  if (tm && !ta) ta = calcularTasaAnual(tm);
  if (ta && !tm) tm = calcularTasaMensual(ta);

  const cm = parseFloat((req.body.cuotaManejo || '0').toString().replace(',', '.')) || 0;

  db.prepare(`UPDATE tarjetas SET
    nombre=?, franquicia=?, cupo_total=?, deuda_actual=?, tasa_mensual=?, tasa_anual=?,
    pago_minimo_porcentaje=0, pago_minimo_monto=NULL, dia_corte=?, dia_pago=?, cuota_manejo=?, color=?
    WHERE id=?`).run(
    nombre.toUpperCase(), (franquicia || '').toUpperCase(), cupoNum,
    redondear(deudaNum), tm, ta,
    diaCorte ? parseInt(diaCorte) : null,
    diaPago ? parseInt(diaPago) : null, cm, color || '#4361ee', parseInt(id)
  );

  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  // compras y pagos se van por ON DELETE CASCADE; simulaciones no tiene FK,
  // así que se borran aquí para no dejar registros huérfanos.
  const eliminarTarjeta = db.transaction((tarjetaId) => {
    db.prepare('DELETE FROM simulaciones WHERE tarjeta_id = ?').run(tarjetaId);
    db.prepare('DELETE FROM tarjetas WHERE id = ?').run(tarjetaId);
    // Si estaba en el resumen del inicio, se quita de la selección.
    const seleccion = leerAjuste(CLAVE_DESTACADAS, []).filter(x => x !== tarjetaId);
    guardarAjuste(CLAVE_DESTACADAS, seleccion);
  });
  eliminarTarjeta(id);
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

  if (!tarjetaId || !nombre) {
    return res.json({ success: false, message: 'Faltan datos' });
  }

  const montoNum = montoValido(monto);
  if (montoNum === null) {
    return res.json({ success: false, message: 'El monto debe ser mayor que cero' });
  }

  const numCuotas = cuotasValidas(cuotas);
  if (numCuotas === null) {
    return res.json({ success: false, message: 'Las cuotas deben ser un número entero mayor que cero' });
  }

  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(parseInt(tarjetaId));
  if (!tarjeta) {
    return res.json({ success: false, message: 'Tarjeta no encontrada' });
  }

  const esSinInteres = !!sinInteres || numCuotas === 1;
  let cuotaMensual;
  let totalIntereses;

  if (esSinInteres) {
    // Sin intereses (o una sola cuota): el monto se reparte entre las cuotas.
    cuotaMensual = montoNum / numCuotas;
    totalIntereses = 0;
  } else {
    const resultado = calcularCuota(montoNum, tarjeta.tasa_mensual, numCuotas);
    cuotaMensual = resultado.cuota;
    totalIntereses = resultado.intereses;
  }

  const info = db.prepare(`INSERT INTO compras
    (tarjeta_id, nombre, descripcion, monto, cuotas, cuota_actual, cuota_mensual, total_intereses, sin_interes, fecha)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    parseInt(tarjetaId), nombre, descripcion || '', montoNum, numCuotas, 1,
    cuotaMensual, totalIntereses, esSinInteres ? 1 : 0, fecha || ahoraFecha()
  );

  // La deuda sube por el total a pagar (capital + intereses), no solo el capital.
  const totalAPagar = Math.round(cuotaMensual * numCuotas * 100) / 100;
  if (tarjeta) {
    db.prepare('UPDATE tarjetas SET deuda_actual = ? WHERE id = ?')
      .run(redondear(tarjeta.deuda_actual + totalAPagar), parseInt(tarjetaId));
  }

  res.json({ success: true, id: info.lastInsertRowid, cuotaMensual, totalIntereses, totalAPagar, sinInteres: esSinInteres });
});

router.put('/compras/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const compra = db.prepare('SELECT * FROM compras WHERE id = ?').get(id);
  if (!compra) return res.json({ success: false, message: 'Compra no encontrada' });

  const { nombre, descripcion, monto, cuotas, fecha, sinInteres } = req.body;

  if (!nombre || !String(nombre).trim()) {
    return res.json({ success: false, message: 'Falta el nombre de la compra' });
  }

  const montoNum = montoValido(monto);
  if (montoNum === null) {
    return res.json({ success: false, message: 'El monto debe ser mayor que cero' });
  }

  const numCuotas = cuotasValidas(cuotas);
  if (numCuotas === null) {
    return res.json({ success: false, message: 'Las cuotas deben ser un número entero mayor que cero' });
  }

  if (numCuotas < compra.cuota_actual) {
    return res.json({
      success: false,
      message: `Las cuotas no pueden ser menores que la cuota actual (${compra.cuota_actual})`
    });
  }

  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(compra.tarjeta_id);
  const esSinInteres = !!sinInteres || numCuotas === 1;

  let cuotaMensual;
  let totalIntereses;
  if (esSinInteres) {
    cuotaMensual = montoNum / numCuotas;
    totalIntereses = 0;
  } else if (tarjeta) {
    const resultado = calcularCuota(montoNum, tarjeta.tasa_mensual, numCuotas);
    cuotaMensual = resultado.cuota;
    totalIntereses = resultado.intereses;
  } else {
    cuotaMensual = montoNum / numCuotas;
    totalIntereses = 0;
  }

  const totalNuevo = redondear(cuotaMensual * numCuotas);
  const totalViejo = compra.cuota_mensual != null
    ? redondear(compra.cuota_mensual * compra.cuotas)
    : compra.monto;

  const editar = db.transaction(() => {
    db.prepare(`UPDATE compras SET nombre=?, descripcion=?, monto=?, cuotas=?, cuota_mensual=?,
                total_intereses=?, sin_interes=?, fecha=? WHERE id=?`).run(
      nombre, descripcion || '', montoNum, numCuotas, cuotaMensual, totalIntereses,
      esSinInteres ? 1 : 0, fecha || compra.fecha, id
    );

    // La deuda se ajusta por la diferencia entre el total anterior y el nuevo.
    if (tarjeta && compra.estado !== 'FINALIZADA') {
      db.prepare('UPDATE tarjetas SET deuda_actual = ? WHERE id = ?')
        .run(Math.max(0, redondear(tarjeta.deuda_actual - totalViejo + totalNuevo)), tarjeta.id);
    }
  });
  editar();

  res.json({ success: true, cuotaMensual, totalIntereses, totalAPagar: totalNuevo });
});

router.post('/compras/:id/avanzar', (req, res) => {
  const compra = db.prepare('SELECT * FROM compras WHERE id = ?').get(parseInt(req.params.id));
  if (!compra) return res.json({ success: false, message: 'Compra no encontrada' });
  if (compra.estado === 'FINALIZADA') {
    return res.json({ success: false, message: 'La compra ya está finalizada' });
  }

  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(compra.tarjeta_id);

  const cuota = compra.cuota_mensual != null
    ? redondear(compra.cuota_mensual)
    : redondear(compra.monto / compra.cuotas);

  // No se descuenta más de lo que se debe (por si ya pagaste a mano).
  const aplicable = tarjeta ? Math.min(cuota, tarjeta.deuda_actual) : 0;

  const esUltima = compra.cuota_actual >= compra.cuotas;
  const nuevaCuotaActual = esUltima ? compra.cuotas : compra.cuota_actual + 1;
  const estadoNuevo = esUltima ? 'FINALIZADA' : 'ACTIVA';

  const avanzar = db.transaction(() => {
    db.prepare('UPDATE compras SET cuota_actual = ?, estado = ? WHERE id = ?')
      .run(nuevaCuotaActual, estadoNuevo, compra.id);

    if (tarjeta && aplicable > 0) {
      db.prepare('UPDATE tarjetas SET deuda_actual = ? WHERE id = ?')
        .run(redondear(tarjeta.deuda_actual - aplicable), tarjeta.id);

      // Queda registrado como pago para que se vea y se pueda deshacer.
      db.prepare('INSERT INTO pagos (tarjeta_id, monto, tipo, fecha, nota) VALUES (?, ?, ?, ?, ?)')
        .run(tarjeta.id, aplicable, 'CUOTA', ahoraFecha(),
             `Cuota ${compra.cuota_actual}/${compra.cuotas} - ${compra.nombre}`);
    }
  });
  avanzar();

  res.json({
    success: true,
    cuotaActual: nuevaCuotaActual,
    estado: estadoNuevo,
    pagado: aplicable
  });
});

router.delete('/compras/:id', (req, res) => {
  const compra = db.prepare('SELECT * FROM compras WHERE id = ?').get(parseInt(req.params.id));
  if (compra && compra.estado !== 'FINALIZADA') {
    const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(compra.tarjeta_id);
    if (tarjeta) {
      // Se descuenta lo mismo que se sumó al crearla: el total con intereses.
      const total = compra.cuota_mensual != null
        ? redondear(compra.cuota_mensual * compra.cuotas)
        : compra.monto;
      db.prepare('UPDATE tarjetas SET deuda_actual = ? WHERE id = ?')
        .run(Math.max(0, redondear(tarjeta.deuda_actual - total)), tarjeta.id);
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
  if (!tarjetaId) return res.json({ success: false, message: 'Faltan datos' });

  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(parseInt(tarjetaId));
  if (!tarjeta) return res.json({ success: false, message: 'Tarjeta no encontrada' });

  const montoNum = parseFloat(monto);
  if (!Number.isFinite(montoNum) || montoNum <= 0) {
    return res.json({ success: false, message: 'El monto debe ser mayor que cero' });
  }

  const pago = redondear(montoNum);
  if (pago > tarjeta.deuda_actual) {
    return res.json({
      success: false,
      message: `El pago no puede superar la deuda actual (${tarjeta.deuda_actual})`
    });
  }

  db.prepare('INSERT INTO pagos (tarjeta_id, monto, tipo, fecha, nota) VALUES (?, ?, ?, ?, ?)')
    .run(parseInt(tarjetaId), pago, tipo || 'OTRO', fecha || ahoraFecha(), nota || '');

  db.prepare('UPDATE tarjetas SET deuda_actual = ? WHERE id = ?')
    .run(redondear(tarjeta.deuda_actual - pago), tarjeta.id);

  res.json({ success: true, deuda: redondear(tarjeta.deuda_actual - pago) });
});

router.delete('/pagos/:id', (req, res) => {
  const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(parseInt(req.params.id));
  if (!pago) return res.json({ success: false, message: 'Pago no encontrado' });

  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(pago.tarjeta_id);

  const borrar = db.transaction(() => {
    db.prepare('DELETE FROM pagos WHERE id = ?').run(pago.id);
    // Al deshacer el pago, la deuda vuelve a subir por ese monto.
    if (tarjeta) {
      db.prepare('UPDATE tarjetas SET deuda_actual = ? WHERE id = ?')
        .run(redondear(tarjeta.deuda_actual + pago.monto), tarjeta.id);
    }
  });
  borrar();

  res.json({
    success: true,
    deuda: tarjeta ? redondear(tarjeta.deuda_actual + pago.monto) : null
  });
});

// ===== SIMULACIONES =====
router.get('/simulaciones', (req, res) => {
  const sims = db.prepare('SELECT s.*, t.nombre as tarjeta_nombre FROM simulaciones s LEFT JOIN tarjetas t ON s.tarjeta_id = t.id ORDER BY s.creado_at DESC').all();
  res.json(sims);
});

router.post('/simular', (req, res) => {
  const { tarjetaId, monto, cuotas } = req.body;
  if (!tarjetaId) return res.json({ success: false, message: 'Faltan datos' });

  const montoNum = montoValido(monto);
  if (montoNum === null) return res.json({ success: false, message: 'El monto debe ser mayor que cero' });

  const numCuotas = cuotasValidas(cuotas);
  if (numCuotas === null) return res.json({ success: false, message: 'Las cuotas deben ser un número entero mayor que cero' });

  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(parseInt(tarjetaId));
  if (!tarjeta) return res.json({ success: false, message: 'Tarjeta no encontrada' });

  const resultado = calcularCuota(montoNum, tarjeta.tasa_mensual, numCuotas);
  res.json({
    success: true,
    tarjetaNombre: tarjeta.nombre,
    tasaMensual: tarjeta.tasa_mensual,
    tasaAnual: tarjeta.tasa_anual,
    monto: montoNum,
    cuotas: numCuotas,
    cuotaMensual: resultado.cuota,
    totalPagado: resultado.total,
    totalIntereses: resultado.intereses
  });
});

router.post('/simulaciones', (req, res) => {
  const { nombre, tarjetaId, monto, cuotas } = req.body;
  if (!nombre || !tarjetaId) return res.json({ success: false, message: 'Faltan datos' });

  const montoNum = montoValido(monto);
  if (montoNum === null) return res.json({ success: false, message: 'El monto debe ser mayor que cero' });

  const numCuotas = cuotasValidas(cuotas);
  if (numCuotas === null) return res.json({ success: false, message: 'Las cuotas deben ser un número entero mayor que cero' });

  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(parseInt(tarjetaId));
  if (!tarjeta) return res.json({ success: false, message: 'Tarjeta no encontrada' });

  const resultado = calcularCuota(montoNum, tarjeta.tasa_mensual, numCuotas);
  const info = db.prepare(`INSERT INTO simulaciones
    (nombre, tarjeta_id, monto, cuotas, tasa_mensual, cuota_mensual, total_pagado, total_intereses)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    nombre, parseInt(tarjetaId), montoNum, numCuotas,
    tarjeta.tasa_mensual, resultado.cuota, resultado.total, resultado.intereses
  );

  res.json({ success: true, id: info.lastInsertRowid, ...resultado });
});

router.post('/simulaciones/:id/finalizar', (req, res) => {
  const sim = db.prepare('SELECT * FROM simulaciones WHERE id = ?').get(parseInt(req.params.id));
  if (!sim) return res.json({ success: false, message: 'Simulación no encontrada' });
  if (sim.estado === 'FINALIZADA') {
    return res.json({ success: false, message: 'Esta simulación ya fue convertida en compra' });
  }

  const tarjeta = db.prepare('SELECT * FROM tarjetas WHERE id = ?').get(sim.tarjeta_id);
  if (!tarjeta) return res.json({ success: false, message: 'Tarjeta no encontrada' });

  const cuotaMensual = sim.cuota_mensual != null
    ? sim.cuota_mensual
    : (sim.total_pagado != null ? sim.total_pagado / sim.cuotas : sim.monto / sim.cuotas);
  const totalIntereses = sim.total_intereses != null
    ? sim.total_intereses
    : (sim.total_pagado != null ? sim.total_pagado - sim.monto : 0);
  const totalAPagar = redondear(cuotaMensual * sim.cuotas);

  const finalizar = db.transaction(() => {
    const info = db.prepare(`INSERT INTO compras
      (tarjeta_id, nombre, descripcion, monto, cuotas, cuota_actual, cuota_mensual,
       total_intereses, sin_interes, fecha)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      sim.tarjeta_id, sim.nombre, 'De simulación', sim.monto, sim.cuotas, 1,
      cuotaMensual, totalIntereses, totalIntereses > 0 ? 0 : 1, ahoraFecha()
    );

    db.prepare('UPDATE tarjetas SET deuda_actual = ? WHERE id = ?')
      .run(redondear(tarjeta.deuda_actual + totalAPagar), tarjeta.id);

    db.prepare('UPDATE simulaciones SET estado = ? WHERE id = ?').run('FINALIZADA', sim.id);

    return info.lastInsertRowid;
  });

  const compraId = finalizar();
  res.json({ success: true, compraId });
});

router.delete('/simulaciones/:id', (req, res) => {
  db.prepare('DELETE FROM simulaciones WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

module.exports = router;
