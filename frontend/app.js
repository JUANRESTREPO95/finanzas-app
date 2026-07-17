const API = '';

let todosLosMovimientos = [];
let todasLasCuentas = [];
let todosLosPendientes = [];
let filtroMovimientos = 'todos';
let menuAbierto = false;
let tipoTransaccion = 'INGRESO';
let mesSelector = { anio: new Date().getFullYear(), mes: new Date().getMonth() + 1 };

// ===== UTILIDADES =====
function $(id) { return document.getElementById(id); }

function formatMonto(valor) {
  return '$' + Number(valor || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  if (!text && text !== 0) return '';
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function fechaActual() {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`;
}

function horaActual() {
  const ahora = new Date();
  return `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
}

function mostrarToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('active');
  setTimeout(() => toast.classList.remove('active'), 2200);
}

function abrirModal(id) {
  $(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}

function cerrarModal(id) {
  $(id).classList.remove('active');
  document.body.style.overflow = '';
}

function nombreMes(mesNum) {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return meses[mesNum - 1];
}

// ===== INICIALIZACIÓN =====
window.onload = function() {
  aplicarModoOscuroGuardado();
  inicializarNavegacion();
  inicializarFAB();
  inicializarModalTransaccion();
  inicializarModales();
  inicializarSelectorMes();
  inicializarAppTarjetas();

  cargarDatosIniciales();

  // Refresco automático silencioso cada 10 segundos
  setInterval(refrescoAutomatico, 10000);
  setInterval(refrescoAutomaticoTarjetas, 10000);
};

function cargarDatosIniciales() {
  cargarCuentas().then(() => {
    cargarDashboard();
    cargarMovimientos();
    cargarPendientes();
  });
}

function aplicarModoOscuroGuardado() {
  if (localStorage.getItem('modoOscuro') === 'true') {
    document.body.classList.add('dark');
    $('btnModoOscuro')?.classList.add('active');
    $('btnModoOscuro')?.querySelector('.config-toggle')?.classList.add('active');
  }
}

function toggleModoOscuro() {
  const esOscuro = document.body.classList.toggle('dark');
  localStorage.setItem('modoOscuro', esOscuro);
  $('btnModoOscuro')?.classList.toggle('active', esOscuro);
  $('btnModoOscuro')?.querySelector('.config-toggle')?.classList.toggle('active', esOscuro);
}

// ===== NAVEGACIÓN =====
function inicializarNavegacion() {
  document.querySelectorAll('#nav-finanzas .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const screenId = item.dataset.screen;
      cambiarPantalla(screenId);
      document.querySelectorAll('#nav-finanzas .nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    });
  });

  $('btnVerTodasCuentas').addEventListener('click', () => {
    cambiarPantalla('screen-cuentas');
    actualizarNav('screen-cuentas');
  });

  $('btnVerTodosMovimientos').addEventListener('click', () => {
    cambiarPantalla('screen-movimientos');
    actualizarNav('screen-movimientos');
  });

  $('btnAddPendiente').addEventListener('click', () => {
    abrirModalGestionPendientes(true);
  });
}

function cambiarPantalla(id) {
  document.querySelectorAll('#app-finanzas .screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function actualizarNav(screenId) {
  document.querySelectorAll('#nav-finanzas .nav-item').forEach(n => n.classList.remove('active'));
  const item = document.querySelector(`#nav-finanzas .nav-item[data-screen="${screenId}"]`);
  if (item) item.classList.add('active');
}

// ===== CARGA DE DATOS =====
function cargarCuentas() {
  return fetch(`${API}/api/cuentas`).then(r => r.json()).then(cuentas => {
    todasLasCuentas = cuentas;
    return cuentas;
  });
}

function cargarDashboard() {
  Promise.all([
    fetch(`${API}/api/totales`).then(r => r.json()),
    fetch(`${API}/api/totales/sin-ahorros`).then(r => r.json()),
    fetch(`${API}/api/movimientos?mes=${mesSelector.mes}&anio=${mesSelector.anio}`).then(r => r.json()),
    fetch(`${API}/api/resumen/mes-actual`).then(r => r.json())
  ]).then(([totalesResp, totalDisp, movimientos, resumenMes]) => {
    const totales = totalesResp.cuentas;
    const grupos = totalesResp.grupos || [];

    const visibles = todasLasCuentas.filter(c => c.incluir_en_total).map(c => c.nombre);
    const totalPatrimonio = visibles.reduce((acc, c) => acc + (totales[c] || 0), 0);
    $('patrimonioTotal').textContent = formatMonto(totalPatrimonio);

    // Mostrar grupos debajo del patrimonio
    const gruposEl = $('gruposResumen');
    if (gruposEl) {
      if (grupos.length) {
        gruposEl.innerHTML = grupos.map(g => `
          <div class="grupo-resumen">
            <span class="grupo-nombre">${escapeHtml(g.nombre)}</span>
            <span class="grupo-monto">${formatMonto(g.total)}</span>
          </div>
        `).join('');
      } else {
        gruposEl.innerHTML = '';
      }
    }

    $('totalSinAhorros') && ($('totalSinAhorros').textContent = formatMonto(totalDisp.total));

    $('resumenIngresos').textContent = formatMonto(resumenMes.ingresos);
    $('resumenSalidas').textContent = formatMonto(resumenMes.salidas);

    renderCuentasCarousel(totales);
    renderDashboardMovimientos(movimientos.slice(0, 6));
    renderCuentasGrid(totales);
  });
}

function renderCuentasCarousel(totales) {
  const icons = ['💳', '💵', '🏦', '💰', '📱', '🪙'];
  const html = todasLasCuentas.map((c, i) => `
    <div class="cuenta-mini">
      <div class="cuenta-mini-top">
        <span class="cuenta-mini-nombre">${escapeHtml(c.nombre)}</span>
        <span class="cuenta-mini-icono">${icons[i % icons.length]}</span>
      </div>
      <span class="cuenta-mini-monto">${formatMonto(totales[c.nombre] || 0)}</span>
    </div>
  `).join('');

  $('cuentasCarousel').innerHTML = html;
}

function renderCuentasGrid(totales) {
  const icons = ['💳', '💵', '🏦', '💰', '📱', '🪙'];
  const totalDisp = Object.entries(totales)
    .filter(([nombre]) => {
      const c = todasLasCuentas.find(x => x.nombre === nombre);
      return c && c.incluir_en_total;
    })
    .reduce((a, [,monto]) => a + monto, 0);

  const html = `
    <div class="cuenta-big cuenta-big-total">
      <div class="cuenta-big-header">
        <span class="cuenta-big-nombre">Total disponible</span>
        <span class="cuenta-big-icono">✨</span>
      </div>
      <span class="cuenta-big-monto">${formatMonto(totalDisp)}</span>
    </div>
  ` + todasLasCuentas.map((c, i) => `
    <div class="cuenta-big">
      <div class="cuenta-big-header">
        <span class="cuenta-big-nombre">${escapeHtml(c.nombre)}</span>
        <span class="cuenta-big-icono">${icons[i % icons.length]}</span>
      </div>
      <span class="cuenta-big-monto">${formatMonto(totales[c.nombre] || 0)}</span>
    </div>
  `).join('');

  $('cuentasGrid').innerHTML = html;
}

function renderDashboardMovimientos(movimientos) {
  $('dashboardMovimientos').innerHTML = renderMovimientosHTML(movimientos, true, true);
}

function renderMovimientosHTML(movimientos, limitar = false, soloLectura = false) {
  if (!movimientos.length) {
    return '<div class="mensaje-vacio">No hay movimientos</div>';
  }

  let html = '';
  let ultimaFecha = '';
  const lista = limitar && movimientos.length > 10 ? movimientos.slice(0, 10) : movimientos;

  lista.forEach((mov, idx) => {
    const fecha = mov.fechaHora ? mov.fechaHora.split(' ')[0] : '';
    if (fecha && fecha !== ultimaFecha) {
      html += `<div class="fecha-divider">${formatearFecha(fecha)}</div>`;
      ultimaFecha = fecha;
    }

    const tipoClass = mov.tipo === 'INGRESO' ? 'ingreso' : 'salida';
    const signo = mov.tipo === 'INGRESO' ? '+' : '−';
    const icono = mov.tipo === 'INGRESO' ? '↓' : '↑';
    const clickAttr = soloLectura ? '' : `onclick="editarMovimiento(${idx})"`;
    html += `
      <div class="movimiento-row" ${clickAttr}>
        <div class="movimiento-avatar ${tipoClass}">${icono}</div>
        <div class="movimiento-body">
          <div class="movimiento-title">${escapeHtml(mov.detalle)}</div>
          <div class="movimiento-subtitle">${escapeHtml(mov.cuenta)} · ${mov.fechaHora?.split(' ')[1] || ''}</div>
        </div>
        <div class="movimiento-amount ${tipoClass}">${signo}${mov.monto.toLocaleString('es-CO')}</div>
      </div>`;
  });

  if (limitar && movimientos.length > 10) {
    html += `<button class="btn-text" style="margin-top:10px;text-align:center;width:100%;" onclick="verMasMovimientos()">Ver ${movimientos.length - 10} más</button>`;
  }

  return html;
}

function formatearFecha(fechaStr) {
  const hoy = fechaActual();
  if (fechaStr === hoy) return 'Hoy';
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const ayerStr = `${ayer.getFullYear()}-${String(ayer.getMonth()+1).padStart(2,'0')}-${String(ayer.getDate()).padStart(2,'0')}`;
  if (fechaStr === ayerStr) return 'Ayer';
  return new Date(fechaStr).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
}

function inicializarSelectorMes() {
  const prev = $('mesPrev');
  const next = $('mesNext');
  const label = $('mesLabel');
  if (!prev || !next || !label) return;

  const actualizarLabel = () => {
    label.textContent = `${nombreMes(mesSelector.mes)} ${mesSelector.anio}`;
  };

  prev.addEventListener('click', () => {
    mesSelector.mes--;
    if (mesSelector.mes < 1) { mesSelector.mes = 12; mesSelector.anio--; }
    actualizarLabel();
    cargarMovimientos();
  });

  next.addEventListener('click', () => {
    mesSelector.mes++;
    if (mesSelector.mes > 12) { mesSelector.mes = 1; mesSelector.anio++; }
    actualizarLabel();
    cargarMovimientos();
  });

  actualizarLabel();
}

function cargarMovimientos() {
  fetch(`${API}/api/movimientos?mes=${mesSelector.mes}&anio=${mesSelector.anio}`).then(r => r.json()).then(movs => {
    todosLosMovimientos = movs;
    aplicarFiltroMovimientos();
  });
}

function aplicarFiltroMovimientos() {
  const filtrados = filtroMovimientos === 'todos'
    ? todosLosMovimientos
    : todosLosMovimientos.filter(m => m.tipo === filtroMovimientos);

  $('todosMovimientos').innerHTML = renderMovimientosHTML(filtrados);
}

function verMasMovimientos() {
  cambiarPantalla('screen-movimientos');
  actualizarNav('screen-movimientos');
}

// ===== PENDIENTES =====
function cargarPendientes() {
  fetch(`${API}/api/pendientes`).then(r => r.json()).then(pendientes => {
    todosLosPendientes = pendientes;
    renderPendientes(pendientes);
  });
}

function renderPendientes(pendientes) {
  const total = pendientes.reduce((s, p) => s + (p.faltante || 0), 0);
  $('totalPendientes').textContent = formatMonto(total);

  if (!pendientes.length) {
    $('todosPendientes').innerHTML = '<div class="mensaje-vacio">No hay pendientes</div>';
    return;
  }

  const grupos = {};
  pendientes.forEach(p => {
    const cat = p.categoria || 'Sin categoría';
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(p);
  });

  let html = '';
  Object.keys(grupos).sort((a,b) => a.localeCompare(b,'es',{sensitivity:'base'})).forEach(cat => {
    const totalCat = grupos[cat].reduce((s,p) => s + (p.faltante||0), 0);
    html += `
      <div class="pendiente-card">
        <div class="pendiente-card-header">
          <span>${escapeHtml(cat)}</span>
          <span class="pendiente-card-total">${formatMonto(totalCat)}</span>
        </div>
        ${grupos[cat].map(p => `
          <div class="pendiente-item ${p.faltante <= 0 ? 'paid' : ''}">
            <div class="pendiente-item-info">
              <div class="pendiente-item-desc">${escapeHtml(p.descripcion)}</div>
              <div class="pendiente-item-meta">Vence: ${p.fecha} · Total: ${formatMonto(p.montoMensual)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="pendiente-item-monto">${formatMonto(p.faltante)}</span>
              ${p.faltante > 0 ? `<button class="btn-icon small" onclick="abrirAbono(${p.id})">+</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>`;
  });

  $('todosPendientes').innerHTML = html;
}

// ===== FAB MENÚ =====
function inicializarFAB() {
  $('fabMain').addEventListener('click', () => {
    menuAbierto = !menuAbierto;
    $('fabMain').classList.toggle('active', menuAbierto);
    $('fabMenu').classList.toggle('visible', menuAbierto);
  });

  document.querySelectorAll('.fab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'ingreso') abrirTransaccion('INGRESO');
      if (action === 'salida') abrirTransaccion('SALIDA');
      if (action === 'transferencia') abrirTransaccion('TRANSFERENCIA');
      cerrarFAB();
    });
  });

  document.addEventListener('click', e => {
    const fab = document.querySelector('.fab-main');
    const menu = document.querySelector('.fab-menu');
    if (menuAbierto && !fab.contains(e.target) && !menu.contains(e.target)) {
      cerrarFAB();
    }
  });
}

function cerrarFAB() {
  menuAbierto = false;
  $('fabMain').classList.remove('active');
  $('fabMenu').classList.remove('visible');
}

// ===== MODAL TRANSACCIÓN =====
function inicializarModalTransaccion() {
  document.querySelectorAll('#tipoSwitch .tipo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tipoSwitch .tipo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setTipoTransaccion(btn.dataset.tipo);
    });
  });

  $('btnGuardarTransaccion').addEventListener('click', guardarTransaccion);
  $('btnCerrarTransaccion').addEventListener('click', () => cerrarModal('modalTransaccion'));
}

function setTipoTransaccion(tipo) {
  tipoTransaccion = tipo;

  // Actualizar botones del switch
  document.querySelectorAll('#tipoSwitch .tipo-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tipo === tipo);
  });

  if (tipo === 'TRANSFERENCIA') {
    $('rowOrigenDestino').style.display = 'flex';
    $('rowCuenta').style.display = 'none';
  } else {
    $('rowOrigenDestino').style.display = 'none';
    $('rowCuenta').style.display = 'block';
  }

  if (tipo === 'INGRESO') {
    $('btnGuardarTransaccion').className = 'btn-giant';
    $('btnGuardarTransaccion').style.background = 'linear-gradient(135deg, #10b981, #059669)';
  } else if (tipo === 'SALIDA') {
    $('btnGuardarTransaccion').className = 'btn-giant';
    $('btnGuardarTransaccion').style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
  } else {
    $('btnGuardarTransaccion').className = 'btn-giant';
    $('btnGuardarTransaccion').style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
  }
}

function setTituloModalTransaccion(tipo, datos) {
  if (datos) {
    $('modalTransaccionTitulo').textContent = tipo === 'INGRESO' ? 'Editar ingreso' : tipo === 'SALIDA' ? 'Editar gasto' : 'Editar transferencia';
  } else {
    $('modalTransaccionTitulo').textContent = tipo === 'INGRESO' ? 'Nuevo ingreso' : tipo === 'SALIDA' ? 'Nuevo gasto' : 'Mover dinero';
  }
}

function abrirTransaccion(tipo, datos = null) {
  setTipoTransaccion(tipo);
  $('transaccionEditId').value = '';
  $('transaccionEditTipo').value = '';
  $('transaccionMonto').value = '';
  $('transaccionDescripcion').value = '';
  $('transaccionFecha').value = fechaActual();
  $('transaccionHora').value = horaActual();

  // Llenar selects
  const opts = todasLasCuentas.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
  $('transaccionCuenta').innerHTML = opts;
  $('transaccionCuentaOrigen').innerHTML = opts;
  $('transaccionCuentaDestino').innerHTML = opts;

  if (datos) {
    $('transaccionEditId').value = datos.id;
    $('transaccionEditTipo').value = datos.tipo;
    $('transaccionMonto').value = datos.monto;
    $('transaccionDescripcion').value = datos.detalle;
    $('transaccionFecha').value = datos.fechaHora.split(' ')[0];
    $('transaccionHora').value = datos.fechaHora.split(' ')[1] || horaActual();
    if (tipo === 'TRANSFERENCIA') {
      $('transaccionCuentaOrigen').value = datos.cuentaOrigen;
      $('transaccionCuentaDestino').value = datos.cuentaDestino;
    } else {
      $('transaccionCuenta').value = datos.cuenta;
    }
    $('btnGuardarTransaccion').textContent = 'Actualizar';
    $('btnEliminarTransaccion').style.display = 'block';
    setTituloModalTransaccion(tipo, true);
  } else {
    $('btnGuardarTransaccion').textContent = 'Guardar';
    $('btnEliminarTransaccion').style.display = 'none';
    setTituloModalTransaccion(tipo, false);
  }

  abrirModal('modalTransaccion');
}

function guardarTransaccion() {
  const btn = $('btnGuardarTransaccion');
  const monto = parseFloat($('transaccionMonto').value || 0);
  const descripcion = $('transaccionDescripcion').value.trim();
  const fecha = $('transaccionFecha').value;
  const hora = $('transaccionHora').value;
  const editId = $('transaccionEditId').value;
  const editTipo = $('transaccionEditTipo').value;

  if (!fecha || !descripcion || monto <= 0) {
    mostrarToast('Completa todos los campos'); return;
  }

  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Guardando...';

  // ========== EDITAR / ELIMINAR MOVIMIENTOS ==========
  if (editId && editTipo !== 'TRANSFERENCIA') {
    fetch(`${API}/api/movimientos/${editTipo}/${editId}`, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ fecha, hora, descripcion, monto, cuenta: $('transaccionCuenta').value })
    })
    .then(r => r.json())
    .then(res => finalizarTransaccion(res, btn, textoOriginal));
    return;
  }

  if (tipoTransaccion === 'TRANSFERENCIA') {
    const origen = $('transaccionCuentaOrigen').value;
    const destino = $('transaccionCuentaDestino').value;
    if (origen === destino) { mostrarToast('Las cuentas deben ser diferentes'); btn.disabled = false; btn.textContent = textoOriginal; return; }

    fetch(`${API}/api/transferencia`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ cuentaOrigen: origen, cuentaDestino: destino, monto, descripcion })
    })
    .then(r => r.json())
    .then(res => finalizarTransaccion(res, btn, textoOriginal));
  } else {
    const endpoint = tipoTransaccion === 'INGRESO' ? 'ingresos' : 'salidas';
    fetch(`${API}/api/${endpoint}`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ fecha, hora, descripcion, monto, cuenta: $('transaccionCuenta').value })
    })
    .then(r => r.json())
    .then(res => finalizarTransaccion(res, btn, textoOriginal));
  }
}

function finalizarTransaccion(res, btn, textoOriginal) {
  btn.disabled = false;
  btn.textContent = textoOriginal;
  if (res.success) {
    cerrarModal('modalTransaccion');
    mostrarToast('Guardado ✅');
    recargarTodo();
  } else {
    mostrarToast('Error: ' + res.message);
  }
}

function editarMovimiento(index) {
  const mov = todosLosMovimientos[index];
  if (!mov) return;
  abrirTransaccion(mov.tipo, mov);
}

// ===== FILTROS =====
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filtroMovimientos = chip.dataset.filtro;
    aplicarFiltroMovimientos();
  });
});

// ===== MODALES GENERALES =====
function actualizarConfigModal() {
  if (appActiva === 'finanzas') {
    $('configFinanzas').style.display = 'block';
    $('configTarjetas').style.display = 'none';
    $('brandTitulo').textContent = 'Mis Finanzas';
    $('btnCambiarModulo').textContent = '💳';
  } else {
    $('configFinanzas').style.display = 'none';
    $('configTarjetas').style.display = 'block';
    $('brandTitulo').textContent = 'Tarjetas de crédito';
    $('btnCambiarModulo').textContent = '💰';
  }
}

function inicializarModales() {
  $('btnConfig').addEventListener('click', () => {
    actualizarConfigModal();
    abrirModal('modalConfig');
  });
  $('btnCerrarConfig').addEventListener('click', () => cerrarModal('modalConfig'));

  $('btnModoOscuro').addEventListener('click', toggleModoOscuro);
  $('btnModoOscuroTarjetas').addEventListener('click', toggleModoOscuro);

  // Botón de cambio de módulo junto a Config
  $('btnCambiarModulo').addEventListener('click', () => {
    const destino = appActiva === 'finanzas' ? 'tarjetas' : 'finanzas';
    cambiarApp(destino);
  });

  document.querySelectorAll('.config-row[data-seccion]').forEach(row => {
    row.addEventListener('click', () => {
      const sec = row.dataset.seccion;
      cerrarModal('modalConfig');
      if (sec === 'cuentas') abrirModalCuentas();
      if (sec === 'pendientes') abrirModalGestionPendientes();
      if (sec === 'configuracion-tarjetas') abrirModalTarjeta();
    });
  });

  $('btnCerrarCuentas').addEventListener('click', () => cerrarModal('modalCuentas'));
  $('btnCerrarPendientes').addEventListener('click', () => cerrarModal('modalPendientes'));
  $('btnCerrarAbono').addEventListener('click', () => cerrarModal('modalAbono'));

  // Cuentas
  $('btnAgregarCuenta').addEventListener('click', () => {
    const nombre = $('nuevaCuenta').value.trim().toUpperCase();
    if (!nombre) { mostrarToast('Escribe el nombre'); return; }
    fetch(`${API}/api/cuentas`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ nombre })
    })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        mostrarToast('Cuenta agregada ✅');
        $('nuevaCuenta').value = '';
        cargarCuentas().then(() => {
          cargarListaCuentas();
          cargarListaGrupos();
          recargarTodo();
        });
      } else {
        mostrarToast('Error: ' + res.message);
      }
    });
  });

  // Grupos
  $('btnNuevoGrupo').addEventListener('click', () => mostrarFormGrupo());
  $('btnCancelarFormGrupo').addEventListener('click', () => {
    $('formGrupo').classList.remove('active');
  });
  $('btnGuardarGrupo').addEventListener('click', guardarGrupo);

  // Pendientes
  $('btnNuevoPendiente').addEventListener('click', () => mostrarFormPendiente());
  $('btnReiniciarPendientes').addEventListener('click', () => {
    if (!confirm('¿Reiniciar todos los abonos? Se borrarán los pagos realizados y volverán al monto completo.')) return;
    fetch(`${API}/api/pendientes/reiniciar`, { method: 'POST' })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          mostrarToast('Abonos reiniciados ✅');
          cargarGestionPendientes();
          cargarPendientes();
        } else {
          mostrarToast('Error al reiniciar');
        }
      });
  });
  $('btnNuevaCategoriaP').addEventListener('click', () => {
    const div = $('inputNuevaCategoriaP');
    div.style.display = div.style.display === 'none' ? 'block' : 'none';
    if (div.style.display === 'block') $('nuevaCategoriaP').focus();
  });
  $('btnCancelarFormPendiente').addEventListener('click', () => {
    $('formPendiente').classList.remove('active');
  });
  $('btnGuardarPendiente').addEventListener('click', guardarPendiente);

  // Abono
  $('btnGuardarAbono').addEventListener('click', guardarAbono);

  // Eliminar transacción
  $('btnEliminarTransaccion').addEventListener('click', eliminarTransaccion);

  // Cerrar modales al hacer click fuera
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function() {
      cerrarModal(this.parentElement.id);
    });
  });
}

function recargarTodo() {
  cargarDashboard();
  cargarMovimientos();
  cargarPendientes();
}

function refrescoAutomatico() {
  // No refrescar si hay algún modal con input activo para evitar cortar al usuario
  const modalesActivos = document.querySelectorAll('.modal.active');
  const hayModalConFormulario = Array.from(modalesActivos).some(m => {
    return m.querySelector('input:focus, textarea:focus, select:focus');
  });
  if (hayModalConFormulario) return;

  cargarCuentas().then(() => {
    recargarTodo();
  });
}

function eliminarTransaccion() {
  const id = $('transaccionEditId').value;
  const tipo = $('transaccionEditTipo').value;
  if (!id || !tipo) return;
  if (!confirm('¿Eliminar este movimiento?')) return;

  const endpoint = tipo === 'INGRESO' ? 'ingresos' : 'salidas';
  fetch(`${API}/api/${endpoint}/${id}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        cerrarModal('modalTransaccion');
        mostrarToast('Movimiento eliminado ✅');
        recargarTodo();
      } else {
        mostrarToast('Error al eliminar');
      }
    });
}

// ===== CONFIG CUENTAS =====
function abrirModalCuentas() {
  abrirModal('modalCuentas');
  cargarListaCuentas();
  cargarListaGrupos();
}

function cargarListaCuentas() {
  fetch(`${API}/api/cuentas`).then(r => r.json()).then(cuentas => {
    $('listaCuentas').innerHTML = cuentas.map(c => `
      <div class="cuenta-config-row">
        <label>
          <input type="checkbox" ${c.incluir_en_total ? 'checked' : ''} onchange="toggleCuentaVisible('${c.nombre}', this.checked)">
          <span>${c.nombre}</span>
        </label>
        <button class="btn-delete" onclick="eliminarCuenta('${c.nombre}')">Eliminar</button>
      </div>
    `).join('');
  });
}

function toggleCuentaVisible(nombre, incluir) {
  fetch(`${API}/api/cuentas/${encodeURIComponent(nombre)}/visible`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ incluir })
  }).then(() => recargarTodo());
}

function eliminarCuenta(nombre) {
  if (!confirm(`¿Eliminar "${nombre}"?`)) return;
  fetch(`${API}/api/cuentas/${encodeURIComponent(nombre)}`, { method: 'DELETE' })
    .then(() => {
      mostrarToast('Cuenta eliminada ✅');
      cargarCuentas().then(() => {
        cargarListaCuentas();
        cargarListaGrupos();
        recargarTodo();
      });
    });
}

// ===== GRUPOS DE CUENTAS =====
function cargarListaGrupos() {
  Promise.all([
    fetch(`${API}/api/grupos`).then(r => r.json()),
    fetch(`${API}/api/cuentas`).then(r => r.json())
  ]).then(([grupos, cuentas]) => {
    const container = $('listaGrupos');
    if (!container) return;

    if (!grupos.length) {
      container.innerHTML = '<p class="modal-hint">No tienes grupos creados. Crea uno para unificar cuentas.</p>';
      return;
    }

    container.innerHTML = grupos.map(g => `
      <div class="grupo-config-card">
        <div class="grupo-config-header">
          <span>${escapeHtml(g.nombre)}</span>
          <div class="grupo-config-actions">
            <button class="btn-icon small" onclick="editarGrupo(${g.id}, '${escapeHtml(g.nombre)}', ${JSON.stringify(g.cuentas).replace(/"/g,'&quot;')})">✎</button>
            <button class="btn-icon small" onclick="eliminarGrupo(${g.id})">🗑</button>
          </div>
        </div>
        <div class="grupo-config-cuentas">${g.cuentas.map(c => `<span class="chip-cuenta">${escapeHtml(c)}</span>`).join('')}</div>
      </div>
    `).join('');

    // Actualizar opciones del form
    const opts = cuentas.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
    $('grupoCuentasSelect').innerHTML = opts;
  });
}

function mostrarFormGrupo(id = null, nombre = '', cuentasSeleccionadas = []) {
  $('grupoEditId').value = id || '';
  $('grupoNombre').value = nombre;
  $('formGrupo').classList.add('active');

  fetch(`${API}/api/cuentas`).then(r => r.json()).then(cuentas => {
    const container = $('grupoCuentasCheckboxes');
    container.innerHTML = cuentas.map(c => `
      <label class="checkbox-pill">
        <input type="checkbox" value="${c.nombre}" ${cuentasSeleccionadas.includes(c.nombre) ? 'checked' : ''}>
        <span>${c.nombre}</span>
      </label>
    `).join('');
  });
}

function editarGrupo(id, nombre, cuentas) {
  mostrarFormGrupo(id, nombre, cuentas);
}

function guardarGrupo() {
  const id = $('grupoEditId').value;
  const nombre = $('grupoNombre').value.trim();
  const checkboxes = $('grupoCuentasCheckboxes').querySelectorAll('input[type="checkbox"]:checked');
  const cuentas = Array.from(checkboxes).map(cb => cb.value);

  if (!nombre) { mostrarToast('Escribe el nombre del grupo'); return; }
  if (cuentas.length === 0) { mostrarToast('Selecciona al menos una cuenta'); return; }

  const url = id ? `${API}/api/grupos/${id}` : `${API}/api/grupos`;
  const method = id ? 'PUT' : 'POST';

  fetch(url, {
    method,
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ nombre, cuentas })
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      mostrarToast(id ? 'Grupo actualizado ✅' : 'Grupo creado ✅');
      $('formGrupo').classList.remove('active');
      $('grupoNombre').value = '';
      $('grupoEditId').value = '';
      cargarListaGrupos();
      recargarTodo();
    } else {
      mostrarToast('Error: ' + res.message);
    }
  });
}

function eliminarGrupo(id) {
  if (!confirm('¿Eliminar este grupo?')) return;
  fetch(`${API}/api/grupos/${id}`, { method: 'DELETE' })
    .then(() => {
      mostrarToast('Grupo eliminado ✅');
      cargarListaGrupos();
      recargarTodo();
    });
}

// ===== GESTIÓN PENDIENTES =====
function abrirModalGestionPendientes(autoNuevo = false) {
  abrirModal('modalPendientes');
  $('formPendiente').classList.remove('active');
  cargarGestionPendientes();
  if (autoNuevo) setTimeout(mostrarFormPendiente, 250);
}

function cargarGestionPendientes() {
  fetch(`${API}/api/pendientes/cats`).then(r => r.json()).then(cats => {
    $('pendienteCategoria').innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
  });

  fetch(`${API}/api/pendientes/all`).then(r => r.json()).then(pendientes => {
    const grupos = {};
    pendientes.forEach(p => {
      const cat = p.categoria || 'Sin categoría';
      if (!grupos[cat]) grupos[cat] = [];
      grupos[cat].push(p);
    });

    if (!pendientes.length) {
      $('listaGestionPendientes').innerHTML = '<div class="mensaje-vacio">No hay pendientes</div>';
      return;
    }

    let html = '';
    Object.keys(grupos).sort((a,b) => a.localeCompare(b,'es',{sensitivity:'base'})).forEach(cat => {
      html += `
        <div class="gestion-categoria">
          <div class="gestion-categoria-header">
            <span>${escapeHtml(cat)}</span>
            <button onclick="eliminarCategoriaPendiente('${cat}')">Eliminar</button>
          </div>
          ${grupos[cat].map(p => `
            <div class="gestion-pendiente-row">
              <div class="gestion-pendiente-info">
                <div class="gestion-pendiente-desc">${escapeHtml(p.descripcion)}</div>
                <div class="gestion-pendiente-meta">${formatMonto(p.montoMensual)} · Vence: ${p.fecha} ${p.pagado === 'OK' ? '✅' : ''}</div>
              </div>
              <div class="gestion-pendiente-actions">
                <button class="btn-icon small" onclick="editarPendiente(${p.id})">✎</button>
                <button class="btn-icon small" onclick="eliminarPendienteById(${p.id})">🗑</button>
              </div>
            </div>
          `).join('')}
        </div>`;
    });

    $('listaGestionPendientes').innerHTML = html;
  });
}

function mostrarFormPendiente() {
  $('pendienteEditId').value = '';
  $('pendienteDesc').value = '';
  $('pendienteMonto').value = '';
  $('pendienteFecha').value = '';
  $('nuevaCategoriaP').value = '';
  $('inputNuevaCategoriaP').style.display = 'none';
  $('formPendiente').classList.add('active');
  $('pendienteDesc').focus();
}

function editarPendiente(id) {
  const p = todosLosPendientes.find(x => x.id === id);
  if (!p) return;
  $('pendienteEditId').value = p.id;
  $('pendienteDesc').value = p.descripcion;
  $('pendienteMonto').value = p.montoMensual;
  $('pendienteFecha').value = p.fecha;
  $('pendienteCategoria').value = p.categoria;
  $('nuevaCategoriaP').value = '';
  $('inputNuevaCategoriaP').style.display = 'none';
  $('formPendiente').classList.add('active');
  $('formPendiente').scrollIntoView({ behavior: 'smooth' });
}

function guardarPendiente() {
  const id = $('pendienteEditId').value;
  const descripcion = $('pendienteDesc').value.trim().toUpperCase();
  const montoMensual = parseFloat($('pendienteMonto').value || 0);
  const fecha = $('pendienteFecha').value.trim();
  const nuevaCat = $('nuevaCategoriaP').value.trim().toUpperCase();
  const categoria = nuevaCat || $('pendienteCategoria').value;

  if (!descripcion || montoMensual <= 0) { mostrarToast('Completa descripción y monto'); return; }

  const datos = { fecha, descripcion, montoMensual, categoria };
  const url = id ? `${API}/api/pendientes/${id}` : `${API}/api/pendientes/nuevo`;
  const method = id ? 'PUT' : 'POST';

  fetch(url, {
    method,
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(datos)
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      mostrarToast(id ? 'Pendiente actualizado ✅' : 'Pendiente agregado ✅');
      $('formPendiente').classList.remove('active');
      $('nuevaCategoriaP').value = '';
      cargarGestionPendientes();
      cargarPendientes();
    } else {
      mostrarToast('Error: ' + res.message);
    }
  });
}

function eliminarPendienteById(id) {
  if (!confirm('¿Eliminar este pendiente?')) return;
  fetch(`${API}/api/pendientes/${id}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(() => {
      mostrarToast('Pendiente eliminado ✅');
      cargarGestionPendientes();
      cargarPendientes();
    });
}

function eliminarCategoriaPendiente(cat) {
  if (!confirm(`¿Eliminar toda la categoría "${cat}"?`)) return;
  fetch(`${API}/api/pendientes/categoria/${encodeURIComponent(cat)}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(() => {
      mostrarToast('Categoría eliminada ✅');
      cargarGestionPendientes();
      cargarPendientes();
    });
}

// ===== ABONO RÁPIDO =====
function abrirAbono(id) {
  const p = todosLosPendientes.find(x => x.id === id);
  if (!p) return;
  $('abonoId').value = p.id;
  $('abonoTitulo').textContent = `Abonar a ${p.descripcion}`;
  $('abonoHint').textContent = `Restante: ${formatMonto(p.faltante)}`;
  $('abonoMonto').value = '';
  abrirModal('modalAbono');
}

function guardarAbono() {
  const id = parseInt($('abonoId').value);
  const monto = parseFloat($('abonoMonto').value || 0);
  if (monto <= 0) { mostrarToast('Ingresa un monto'); return; }

  fetch(`${API}/api/pendientes/abono`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ items: [{ id, incrementoAbono: monto }] })
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      mostrarToast('Abono guardado ✅');
      cerrarModal('modalAbono');
      cargarPendientes();
    } else {
      mostrarToast('Error al guardar');
    }
  });
}

// ============================================================
// MÓDULO TARJETAS DE CRÉDITO (TOTALMENTE AISLADO DE FINANZAS)
// ============================================================
let appActiva = 'finanzas';
let tarjetasCache = [];
let tarjetaDetalleId = null;
let simulacionTemp = null;

function inicializarAppTarjetas() {
  // Selector del top-bar
  function toggleBrandMenu() {
    const menu = $('brandMenu');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  }

  $('brandSelector')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    toggleBrandMenu();
  });

  $('brandSelector')?.addEventListener('touchend', e => {
    e.preventDefault();
    e.stopPropagation();
    toggleBrandMenu();
  }, { passive: false });

  document.addEventListener('click', e => {
    const sel = $('brandSelector');
    if (sel && !sel.contains(e.target)) {
      $('brandMenu').style.display = 'none';
    }
  });

  document.addEventListener('touchend', e => {
    const sel = $('brandSelector');
    if (sel && !sel.contains(e.target)) {
      $('brandMenu').style.display = 'none';
    }
  }, { passive: true });

  document.querySelectorAll('.brand-menu-item').forEach(btn => {
    btn.addEventListener('click', () => cambiarApp(btn.dataset.app));
  });

  // Navegación inferior de tarjetas
  document.querySelectorAll('#nav-tarjetas .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const screenId = item.dataset.screen;
      cambiarPantallaTarjetas(screenId);
      document.querySelectorAll('#nav-tarjetas .nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // Botones tarjetas
  $('btnNuevaTarjeta')?.addEventListener('click', () => abrirModalTarjeta());
  $('btnVolverTarjeta')?.addEventListener('click', () => cambiarPantallaTarjetas('screen-tarjetas-dashboard'));
  $('btnNuevaCompra')?.addEventListener('click', () => abrirModalCompra(tarjetaDetalleId));
  $('btnNuevoPago')?.addEventListener('click', () => abrirModalPago(tarjetaDetalleId));

  // Modal tarjeta
  $('btnCerrarTarjeta')?.addEventListener('click', () => cerrarModal('modalTarjeta'));
  $('btnGuardarTarjeta')?.addEventListener('click', guardarTarjeta);
  $('btnEliminarTarjeta')?.addEventListener('click', eliminarTarjeta);

  // Modal compra
  $('btnCerrarCompra')?.addEventListener('click', () => cerrarModal('modalCompra'));
  $('btnGuardarCompra')?.addEventListener('click', guardarCompra);

  // Modal pago
  $('btnCerrarPago')?.addEventListener('click', () => cerrarModal('modalPago'));
  $('btnGuardarPago')?.addEventListener('click', guardarPago);

  // Simulador
  $('btnSimular')?.addEventListener('click', simularCompra);
  $('btnGuardarSimulacion')?.addEventListener('click', guardarSimulacion);
}

function cambiarApp(app) {
  appActiva = app;
  document.querySelectorAll('.brand-menu-item').forEach(b => b.classList.toggle('active', b.dataset.app === app));
  $('brandMenu').style.display = 'none';
  actualizarConfigModal();

  if (app === 'finanzas') {
    $('app-finanzas').classList.add('active');
    $('app-tarjetas').classList.remove('active');
    document.body.classList.remove('modulo-tarjetas');
    recargarTodo();
  } else {
    $('app-finanzas').classList.remove('active');
    $('app-tarjetas').classList.add('active');
    document.body.classList.add('modulo-tarjetas');
    cargarTarjetasDashboard();
  }
}

function cambiarPantallaTarjetas(id) {
  document.querySelectorAll('#screens-tarjetas .screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');

  if (id === 'screen-tarjetas-dashboard') cargarTarjetasDashboard();
  if (id === 'screen-tarjetas-compras') cargarTodasComprasActivas();
  if (id === 'screen-tarjetas-simulador') cargarSimulaciones();
}

// ===== API TARJETAS =====
function apiTarjetasGET(path) {
  return fetch(`${API}/api/tarjetas${path}`).then(r => r.json());
}

function apiTarjetasPOST(path, body) {
  return fetch(`${API}/api/tarjetas${path}`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  }).then(r => r.json());
}

function apiTarjetasPUT(path, body) {
  return fetch(`${API}/api/tarjetas${path}`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  }).then(r => r.json());
}

function apiTarjetasDELETE(path) {
  return fetch(`${API}/api/tarjetas${path}`, { method: 'DELETE' }).then(r => r.json());
}

// ===== DASHBOARD TARJETAS =====
function cargarTarjetasDashboard() {
  apiTarjetasGET('/resumen').then(res => {
    $('tarjetasDeudaTotal').textContent = formatMonto(res.deudaTotal);
    $('tarjetasCupoTotal').textContent = formatMonto(res.cupoTotal);
    $('tarjetasDisponibleTotal').textContent = formatMonto(res.disponible);
    $('tarjetasPagoMinimoTotal').textContent = formatMonto(res.pagoMinimoTotal);
    $('tarjetasComprasActivasTotal').textContent = formatMonto(res.comprasActivas || 0);

    tarjetasCache = res.tarjetas || [];
    renderizarTarjetas(res.tarjetas || []);
  });
}

function renderizarTarjetas(tarjetas) {
  if (!tarjetas.length) {
    $('tarjetasLista').innerHTML = '<div class="mensaje-vacio">No tienes tarjetas registradas</div>';
    return;
  }

  $('tarjetasLista').innerHTML = tarjetas.map(t => {
    const porcentaje = t.cupo_total > 0 ? (t.deuda_actual / t.cupo_total) * 100 : 0;
    const pagoMinimo = t.pago_minimo || t.pago_minimo_monto || (t.deuda_actual * (t.pago_minimo_porcentaje || 0) / 100) || 0;
    return `
      <div class="tarjeta-card" onclick="verTarjeta(${t.id})" style="--tarjeta-color:${t.color || '#ef4444'}"
        role="button" tabindex="0">
        <div class="tarjeta-card-header">
          <span class="tarjeta-card-nombre">${escapeHtml(t.nombre)}</span>
          <span class="tarjeta-card-franquicia">${escapeHtml(t.franquicia || '')}</span>
        </div>
        <div class="tarjeta-card-row">
          <span class="tarjeta-card-label">Cupo total</span>
          <span class="tarjeta-card-value">${formatMonto(t.cupo_total)}</span>
        </div>
        <div class="tarjeta-card-row">
          <span class="tarjeta-card-label">Deuda</span>
          <span class="tarjeta-card-value">${formatMonto(t.deuda_actual)}</span>
        </div>
        <div class="tarjeta-card-row">
          <span class="tarjeta-card-label">Disponible</span>
          <span class="tarjeta-card-value">${formatMonto(Math.max(0, t.cupo_total - t.deuda_actual))}</span>
        </div>
        <div class="tarjeta-card-row">
          <span class="tarjeta-card-label">Cuota de manejo</span>
          <span class="tarjeta-card-value">${formatMonto(t.cuota_manejo || 0)}</span>
        </div>
        <div class="tarjeta-card-row">
          <span class="tarjeta-card-label">Pago mínimo</span>
          <span class="tarjeta-card-value">${formatMonto(pagoMinimo)}</span>
        </div>
        <div class="tarjeta-progress">
          <div class="tarjeta-progress-bar" style="width:${Math.min(porcentaje, 100)}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

// ===== DETALLE TARJETA =====
function renderizarDetalleTarjeta(id) {
  const t = tarjetasCache.find(x => x.id === id);
  if (!t) return;

  $('tarjetaDetalleNombre').textContent = t.nombre;
  $('tarjetaDetalleFranquicia').textContent = t.franquicia || '';
  $('tarjetaDetalleCupo').textContent = formatMonto(t.cupo_total);
  $('tarjetaDetalleDeuda').textContent = formatMonto(t.deuda_actual);
  $('tarjetaDetalleDisponible').textContent = formatMonto(Math.max(0, t.cupo_total - t.deuda_actual));
  $('tarjetaDetalleCuotaManejo').textContent = formatMonto(t.cuota_manejo || 0);
  const pagoMinimo = t.pago_minimo || t.pago_minimo_monto || (t.deuda_actual * (t.pago_minimo_porcentaje || 0) / 100) || 0;
  $('tarjetaDetallePagoMinimo').textContent = formatMonto(pagoMinimo);

  const porcentaje = t.cupo_total > 0 ? (t.deuda_actual / t.cupo_total) * 100 : 0;
  $('tarjetaDetalleProgress').style.width = `${Math.min(porcentaje, 100)}%`;

  let fechasHtml = '';
  if (t.dia_corte) fechasHtml += `<span>Corte: ${t.dia_corte}</span>`;
  if (t.dia_pago) fechasHtml += `<span>Pago: ${t.dia_pago}</span>`;
  $('tarjetaDetalleFechas').innerHTML = fechasHtml;

  $('tarjetaBigCard').onclick = () => abrirModalTarjeta(t);
  $('tarjetaBigCard').style.cursor = 'pointer';
}

function verTarjeta(id) {
  tarjetaDetalleId = id;
  renderizarDetalleTarjeta(id);

  Promise.all([
    apiTarjetasGET(`/compras/${id}`),
    apiTarjetasGET(`/pagos/${id}`)
  ]).then(([compras, pagos]) => {
    renderizarCompras(compras, 'tarjetaCompras');
    renderizarPagos(pagos, 'tarjetaPagos');
    cambiarPantallaTarjetas('screen-tarjeta-detalle');
  });
}

// ===== MODAL TARJETA =====
function abrirModalTarjeta(tarjeta = null) {
  $('tarjetaEditId').value = tarjeta?.id || '';
  $('modalTarjetaTitulo').textContent = tarjeta ? 'Editar tarjeta' : 'Nueva tarjeta';
  $('tarjetaNombre').value = tarjeta?.nombre || '';
  $('tarjetaFranquicia').value = tarjeta?.franquicia || '';
  $('tarjetaCupo').value = tarjeta?.cupo_total || '';
  $('tarjetaDeuda').value = tarjeta?.deuda_actual || '';
  $('tarjetaTasaMensual').value = tarjeta?.tasa_mensual || '';
  $('tarjetaTasaAnual').value = tarjeta?.tasa_anual || '';
  $('tarjetaDiaCorte').value = tarjeta?.dia_corte || '';
  $('tarjetaDiaPago').value = tarjeta?.dia_pago || '';
  $('tarjetaCuotaManejo').value = tarjeta?.cuota_manejo || '';
  $('tarjetaColor').value = tarjeta?.color || '#ef4444';
  $('btnEliminarTarjeta').style.display = tarjeta ? 'block' : 'none';
  abrirModal('modalTarjeta');
}

function guardarTarjeta() {
  const id = $('tarjetaEditId').value;
  const datos = {
    nombre: $('tarjetaNombre').value.trim(),
    franquicia: $('tarjetaFranquicia').value.trim(),
    cupoTotal: parseFloat($('tarjetaCupo').value || 0),
    deudaActual: parseFloat($('tarjetaDeuda').value || 0),
    tasaMensual: parseFloat(($('tarjetaTasaMensual').value || '0').toString().replace(',', '.')) || 0,
    tasaAnual: parseFloat(($('tarjetaTasaAnual').value || '0').toString().replace(',', '.')) || 0,
    cuotaManejo: parseFloat(($('tarjetaCuotaManejo').value || '0').toString().replace(',', '.')) || 0,
    diaCorte: parseInt($('tarjetaDiaCorte').value) || null,
    diaPago: parseInt($('tarjetaDiaPago').value) || null,
    color: $('tarjetaColor').value
  };

  if (!datos.nombre || datos.cupoTotal <= 0) {
    mostrarToast('Ingresa nombre y cupo total');
    return;
  }

  const prom = id ? apiTarjetasPUT(`/${id}`, datos) : apiTarjetasPOST('', datos);
  prom.then(res => {
    if (res.success) {
      mostrarToast(id ? 'Tarjeta actualizada ✅' : 'Tarjeta creada ✅');
      cerrarModal('modalTarjeta');
      cargarTarjetasDashboard();
      if (tarjetaDetalleId && id) verTarjeta(parseInt(id));
    } else {
      mostrarToast('Error: ' + (res.message || 'desconocido'));
    }
  });
}

function eliminarTarjeta() {
  const id = $('tarjetaEditId').value;
  if (!id) return;
  if (!confirm('¿Eliminar esta tarjeta? Se borrarán también sus compras, pagos y simulaciones.')) return;

  apiTarjetasDELETE(`/${id}`).then(() => {
    mostrarToast('Tarjeta eliminada ✅');
    cerrarModal('modalTarjeta');
    tarjetaDetalleId = null;
    cambiarPantallaTarjetas('screen-tarjetas-dashboard');
    cargarTarjetasDashboard();
  });
}

// ===== COMPRAS =====
function abrirModalCompra(tarjetaId) {
  $('compraTarjetaId').value = tarjetaId;
  $('compraNombre').value = '';
  $('compraDescripcion').value = '';
  $('compraMonto').value = '';
  $('compraCuotas').value = '1';
  $('compraUnaCuotaSinInteres').checked = false;
  $('compraFecha').value = fechaActual();
  abrirModal('modalCompra');
}

function guardarCompra() {
  const tarjetaId = parseInt($('compraTarjetaId').value);
  const monto = parseFloat($('compraMonto').value || 0);
  if (!tarjetaId || monto <= 0) { mostrarToast('Completa los datos'); return; }

  const numCuotas = Math.max(1, parseInt($('compraCuotas').value) || 1);
  const datos = {
    tarjetaId,
    nombre: $('compraNombre').value.trim(),
    descripcion: $('compraDescripcion').value.trim(),
    monto,
    cuotas: numCuotas,
    fecha: $('compraFecha').value,
    sinInteres: $('compraUnaCuotaSinInteres').checked || numCuotas === 1
  };

  apiTarjetasPOST('/compras', datos).then(res => {
    if (res.success) {
      mostrarToast('Compra agregada ✅');
      cerrarModal('modalCompra');
      cargarTarjetasDashboard();
      if (tarjetaDetalleId === tarjetaId) verTarjeta(tarjetaId);
    } else {
      mostrarToast('Error: ' + (res.message || 'desconocido'));
    }
  });
}

function renderizarCompras(compras, containerId) {
  const container = $(containerId);
  if (!compras || !compras.length) {
    container.innerHTML = '<div class="mensaje-vacio">No hay compras registradas</div>';
    return;
  }

  container.innerHTML = compras.map(c => {
    const esFinalizada = c.estado === 'FINALIZADA';
    return `
      <div class="compra-card ${esFinalizada ? 'finalizada' : ''}">
        <div class="compra-card-header">
          <span class="compra-card-nombre">${escapeHtml(c.nombre)} ${esFinalizada ? '✅' : ''}</span>
          <span class="compra-card-monto">${formatMonto(c.monto)}</span>
        </div>
        <div class="compra-card-meta">
          ${escapeHtml(c.descripcion || '')} · Cuota ${c.cuota_actual}/${c.cuotas} · ${c.fecha}
          ${c.cuota_mensual ? ` · Cuota mensual: ${formatMonto(c.cuota_mensual)}` : ''}
          ${c.sin_interes ? ' · Sin intereses' : (c.total_intereses > 0 ? ` · Intereses: ${formatMonto(c.total_intereses)}` : '')}
        </div>
        ${!esFinalizada ? `
          <div class="compra-card-actions">
            <button class="btn-small" onclick="avanzarCompra(${c.id}, event)">Avanzar cuota</button>
            <button class="btn-small danger" onclick="eliminarCompra(${c.id}, event)">Eliminar</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function avanzarCompra(id, e) {
  if (e) e.stopPropagation();
  apiTarjetasPOST(`/compras/${id}/avanzar`).then(() => {
    mostrarToast('Cuota avanzada ✅');
    cargarTodasComprasActivas();
    if (tarjetaDetalleId) verTarjeta(tarjetaDetalleId);
  });
}

function eliminarCompra(id, e) {
  if (e) e.stopPropagation();
  if (!confirm('¿Eliminar esta compra?')) return;
  apiTarjetasDELETE(`/compras/${id}`).then(() => {
    mostrarToast('Compra eliminada ✅');
    cargarTarjetasDashboard();
    if (tarjetaDetalleId) verTarjeta(tarjetaDetalleId);
  });
}

function cargarTodasComprasActivas() {
  apiTarjetasGET('').then(tarjetas => {
    const mapaColores = {};
    tarjetas.forEach(t => mapaColores[t.id] = t.color || '#4361ee');
    const promesas = tarjetas.map(t => apiTarjetasGET(`/compras/${t.id}`).then(c => c.map(x => ({...x, tarjetaNombre: t.nombre, tarjetaColor: t.color || '#4361ee'}))));
    Promise.all(promesas).then(grupos => {
      const todas = grupos.flat().filter(c => c.estado !== 'FINALIZADA');
      const container = $('todasComprasActivas');
      if (!todas.length) {
        container.innerHTML = '<div class="mensaje-vacio">No tienes compras activas</div>';
        return;
      }
      container.innerHTML = todas.map(c => `
        <div class="compra-card" style="border-left: 5px solid ${escapeHtml(c.tarjetaColor)};">
          <div class="compra-card-header">
            <span class="compra-card-nombre">${escapeHtml(c.nombre)}</span>
            <span class="compra-card-monto">${formatMonto(c.monto)}</span>
          </div>
          <div class="compra-card-meta">
            <span style="display:inline-flex;align-items:center;gap:4px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${escapeHtml(c.tarjetaColor)};"></span>
              ${escapeHtml(c.tarjetaNombre)}
            </span> · Cuota ${c.cuota_actual}/${c.cuotas} · ${c.fecha}
            ${c.cuota_mensual ? ` · Cuota mensual: ${formatMonto(c.cuota_mensual)}` : ''}
            ${c.sin_interes ? ' · Sin intereses' : (c.total_intereses > 0 ? ` · Intereses: ${formatMonto(c.total_intereses)}` : '')}
          </div>
        </div>
      `).join('');
    });
  });
}

// ===== PAGOS =====
function abrirModalPago(tarjetaId) {
  $('pagoTarjetaId').value = tarjetaId;
  $('pagoMonto').value = '';
  $('pagoTipo').value = 'PAGO_MINIMO';
  $('pagoFecha').value = fechaActual();
  $('pagoNota').value = '';
  const t = tarjetasCache.find(x => x.id === tarjetaId);
  $('modalPagoTitulo').textContent = t ? `Pago - ${t.nombre}` : 'Nuevo pago';
  abrirModal('modalPago');
}

function guardarPago() {
  const tarjetaId = parseInt($('pagoTarjetaId').value);
  const monto = parseFloat($('pagoMonto').value || 0);
  if (!tarjetaId || monto <= 0) { mostrarToast('Ingresa un monto válido'); return; }

  const datos = {
    tarjetaId,
    monto,
    tipo: $('pagoTipo').value,
    fecha: $('pagoFecha').value,
    nota: $('pagoNota').value.trim()
  };

  apiTarjetasPOST('/pagos', datos).then(res => {
    if (res.success) {
      mostrarToast('Pago registrado ✅');
      cerrarModal('modalPago');
      cargarTarjetasDashboard();
      if (tarjetaDetalleId === tarjetaId) verTarjeta(tarjetaId);
    } else {
      mostrarToast('Error: ' + (res.message || 'desconocido'));
    }
  });
}

function renderizarPagos(pagos, containerId) {
  const container = $(containerId);
  if (!pagos || !pagos.length) {
    container.innerHTML = '<div class="mensaje-vacio">No hay pagos registrados</div>';
    return;
  }
  container.innerHTML = pagos.map(p => `
    <div class="pago-card">
      <div class="pago-card-header">
        <span class="pago-card-tipo">${escapeHtml(p.tipo || 'OTRO').replace(/_/g,' ')}</span>
        <span class="pago-card-monto">${formatMonto(p.monto)}</span>
      </div>
      <div class="pago-card-meta">${p.fecha} · ${escapeHtml(p.nota || '')}</div>
    </div>
  `).join('');
}

// ===== SIMULADOR =====
function simularCompra() {
  const tarjetaId = parseInt($('simTarjeta').value);
  const monto = parseFloat($('simMonto').value || 0);
  const cuotas = parseInt($('simCuotas').value);

  if (!tarjetaId || monto <= 0 || !cuotas) {
    mostrarToast('Selecciona tarjeta, monto y cuotas');
    return;
  }

  apiTarjetasPOST('/simular', { tarjetaId, monto, cuotas }).then(res => {
    if (!res.success) { mostrarToast('Error: ' + res.message); return; }
    simulacionTemp = { tarjetaId, monto, cuotas };
    $('simCuotaMensual').textContent = formatMonto(res.cuotaMensual);
    $('simTotalPagado').textContent = formatMonto(res.totalPagado);
    $('simTotalIntereses').textContent = formatMonto(res.totalIntereses);
    $('simResultado').style.display = 'block';
    $('simNombre').value = '';
  });
}

function guardarSimulacion() {
  if (!simulacionTemp) { mostrarToast('Primero simula una compra'); return; }
  const nombre = $('simNombre').value.trim();
  if (!nombre) { mostrarToast('Dale un nombre a la simulación'); return; }

  apiTarjetasPOST('/simulaciones', { ...simulacionTemp, nombre }).then(res => {
    if (res.success) {
      mostrarToast('Simulación guardada ✅');
      $('simResultado').style.display = 'none';
      $('simMonto').value = '';
      $('simNombre').value = '';
      simulacionTemp = null;
      cargarSimulaciones();
    } else {
      mostrarToast('Error: ' + (res.message || 'desconocido'));
    }
  });
}

function cargarSimulaciones() {
  apiTarjetasGET('').then(tarjetas => {
    const opts = tarjetas.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
    $('simTarjeta').innerHTML = opts;
  });

  apiTarjetasGET('/simulaciones').then(sims => {
    const container = $('simulacionesLista');
    if (!sims || !sims.length) {
      container.innerHTML = '<div class="mensaje-vacio">No tienes simulaciones guardadas</div>';
      return;
    }

    container.innerHTML = sims.map(s => `
      <div class="simulacion-card">
        <div class="simulacion-card-header">
          <span class="simulacion-card-nombre">${escapeHtml(s.nombre)} ${s.estado === 'FINALIZADA' ? '✅' : ''}</span>
          <span class="simulacion-card-cuota">${formatMonto(s.cuota_mensual)}/mes</span>
        </div>
        <div class="simulacion-card-meta">
          ${s.cuotas} cuotas · Total: ${formatMonto(s.total_pagado)} · Intereses: ${formatMonto(s.total_intereses)}
        </div>
        ${s.estado !== 'FINALIZADA' ? `
          <div class="simulacion-card-actions">
            <button class="btn-small" onclick="finalizarSimulacion(${s.id})">Finalizar y subir</button>
            <button class="btn-small danger" onclick="eliminarSimulacion(${s.id})">Eliminar</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  });
}

function finalizarSimulacion(id) {
  if (!confirm('¿Convertir esta simulación en una compra real?')) return;
  apiTarjetasPOST(`/simulaciones/${id}/finalizar`).then(() => {
    mostrarToast('Simulación convertida en compra ✅');
    cargarSimulaciones();
    cargarTarjetasDashboard();
  });
}

function eliminarSimulacion(id) {
  if (!confirm('¿Eliminar esta simulación?')) return;
  apiTarjetasDELETE(`/simulaciones/${id}`).then(() => {
    mostrarToast('Simulación eliminada ✅');
    cargarSimulaciones();
  });
}

// ===== REFRESCO AUTOMÁTICO TARJETAS =====
function refrescoAutomaticoTarjetas() {
  if (appActiva !== 'tarjetas') return;
  if (document.querySelector('#app-tarjetas .modal.active input:focus')) return;
  cargarTarjetasDashboard();
  if (tarjetaDetalleId && $('screen-tarjeta-detalle').classList.contains('active')) {
    renderizarDetalleTarjeta(tarjetaDetalleId);
    Promise.all([
      apiTarjetasGET(`/compras/${tarjetaDetalleId}`),
      apiTarjetasGET(`/pagos/${tarjetaDetalleId}`)
    ]).then(([compras, pagos]) => {
      renderizarCompras(compras, 'tarjetaCompras');
      renderizarPagos(pagos, 'tarjetaPagos');
    });
  }
  if ($('screen-tarjetas-compras').classList.contains('active')) cargarTodasComprasActivas();
  if ($('screen-tarjetas-simulador').classList.contains('active')) cargarSimulaciones();
}

// Inicializar el módulo de tarjetas junto con finanzas
inicializarAppTarjetas();
setInterval(refrescoAutomaticoTarjetas, 10000);
