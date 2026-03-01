const API = '';

let movimientosCargados = 10;
let todosLosMovimientos = [];
let pendientesCache = [];

// ===== UTILIDADES =====
function obtenerFechaActual() {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`;
}

function obtenerHoraActual() {
  const ahora = new Date();
  return `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
}

function escapeHtml(text) {
  if (!text && text !== 0) return '';
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ===== CARGA INICIAL =====
window.onload = function() {
  cargarCuentas(() => {
    cargarTotales();
    cargarMovimientos(true);
    cargarPendientes();
    cargarCategorias();
  });
  inicializarMenuFlotante();
};

// ===== CUENTAS =====
function cargarCuentas(callback) {
  fetch(`${API}/api/cuentas`)
    .then(r => r.json())
    .then(cuentas => {
      const header = document.getElementById('headerCuentas');
      const cuentasHTML = cuentas.map(c =>
        `<div class="cuenta">
          <div>${c}</div>
          <div id="total_${c.replace(/\s+/g,'_')}" class="monto">$0</div>
        </div>`
      ).join('<div class="divider"></div>');

      header.innerHTML = `
        <div class="cuentas-row">${cuentasHTML}</div>
        <div class="total-sin-ahorros">
          <div>Total disponible (sin ahorros)</div>
          <div id="totalSinAhorros" class="total-sin-ahorros-monto">$0</div>
        </div>`;

      ['ingresoCuenta','salidaCuenta','transferenciaCuentaOrigen','transferenciaCuentaDestino'].forEach(id => {
        document.getElementById(id).innerHTML = cuentas.map(c => `<option value="${c}">${c}</option>`).join('');
      });

      window.listaCuentas = cuentas;
      if (callback) callback();
    });
}

// ===== TOTALES =====
function cargarTotales() {
  fetch(`${API}/api/totales`)
    .then(r => r.json())
    .then(totales => {
      if (window.listaCuentas) {
        window.listaCuentas.forEach(c => {
          const el = document.getElementById('total_' + c.replace(/\s+/g,'_'));
          if (el) el.textContent = '$' + (totales[c] || 0).toLocaleString('es-CO');
        });
      }
    });

  fetch(`${API}/api/totales/sin-ahorros`)
    .then(r => r.json())
    .then(data => {
      const el = document.getElementById('totalSinAhorros');
      if (el) el.textContent = '$' + (data.total || 0).toLocaleString('es-CO');
    });
}

// ===== MOVIMIENTOS =====
function cargarMovimientos(resetear = false) {
  if (resetear) { movimientosCargados = 10; todosLosMovimientos = []; }

  fetch(`${API}/api/movimientos`)
    .then(r => r.json())
    .then(movimientos => {
      todosLosMovimientos = movimientos || [];
      const tabla = document.getElementById('tablaMovimientos');

      if (todosLosMovimientos.length === 0) {
        tabla.innerHTML = '<div class="mensaje-vacio">No hay movimientos registrados</div>';
        return;
      }

      const slice = todosLosMovimientos.slice(0, movimientosCargados);
      let html = '';

      slice.forEach((mov, index) => {
        const tipoClass = mov.tipo === 'INGRESO' ? 'ingreso' : 'salida';
        const signo = mov.tipo === 'INGRESO' ? '+' : '-';
        html += `
          <div class="movimiento-item">
            <div class="movimiento-monto ${tipoClass}">${signo}${mov.monto.toLocaleString('es-CO')}</div>
            <div class="movimiento-info">
              <div class="movimiento-detalle">${escapeHtml(mov.detalle)}</div>
              <div class="movimiento-cuenta">${escapeHtml(mov.cuenta)}</div>
            </div>
            <div class="movimiento-acciones">
              <button class="btn-editar" onclick="abrirEdicionMovimiento(${index})">✎</button>
              <button class="btn-eliminar" onclick="eliminarMovimiento(${index})">🗑</button>
            </div>
          </div>`;
      });

      if (movimientosCargados < todosLosMovimientos.length) {
        html += `<div style="text-align:center;padding:20px;">
          <button id="btnCargarMas" class="btn-cargar-mas">
            Cargar más (${todosLosMovimientos.length - movimientosCargados} restantes)
          </button></div>`;
      }

      tabla.innerHTML = html;

      const btn = document.getElementById('btnCargarMas');
      if (btn) btn.addEventListener('click', () => { movimientosCargados += 10; cargarMovimientos(false); });
    });
}

// ===== ELIMINAR MOVIMIENTO =====
function eliminarMovimiento(index) {
  const mov = todosLosMovimientos[index];
  if (!mov) return;

  if (!confirm(`¿Eliminar este movimiento?\n\n${mov.tipo}: ${mov.monto.toLocaleString('es-CO')}\n${mov.detalle}\n${mov.cuenta}`)) return;

  fetch(`${API}/api/movimientos/${mov.tipo}/${mov.id}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        alert('Movimiento eliminado ✅');
        cargarTotales();
        cargarMovimientos(true);
      } else {
        alert('Error al eliminar');
      }
    });
}

// ===== EDITAR MOVIMIENTO =====
let movimientoEditando = null;

function abrirEdicionMovimiento(index) {
  const mov = todosLosMovimientos[index];
  if (!mov) return;
  movimientoEditando = Object.assign({}, mov);

  if (mov.tipo === 'INGRESO') {
    document.getElementById('ingresoDescripcion').value = mov.detalle;
    document.getElementById('ingresoMonto').value = mov.monto;
    document.getElementById('ingresoCuenta').value = mov.cuenta;
    document.getElementById('ingresoFecha').value = mov.fechaHora.split(' ')[0];

    const btn = document.getElementById('btnGuardarIngreso');
    btn.textContent = 'Actualizar';
    btn.dataset.modo = 'edicion';
    document.getElementById('modalIngreso').style.display = 'block';
  } else {
    document.getElementById('salidaDescripcion').value = mov.detalle;
    document.getElementById('salidaMonto').value = mov.monto;
    document.getElementById('salidaCuenta').value = mov.cuenta;
    document.getElementById('salidaFecha').value = mov.fechaHora.split(' ')[0];

    const btn = document.getElementById('btnGuardarSalida');
    btn.textContent = 'Actualizar';
    btn.dataset.modo = 'edicion';
    document.getElementById('modalSalida').style.display = 'block';
  }
}

// ===== CATEGORIAS =====
function cargarCategorias() {
  fetch(`${API}/api/categorias`)
    .then(r => r.json())
    .then(data => {
      document.getElementById('ingresoCategoria').innerHTML =
        data.ingresos.map(c => `<option value="${c}">${c}</option>`).join('');
      document.getElementById('salidaCategoria').innerHTML =
        data.salidas.map(c => `<option value="${c}">${c}</option>`).join('');
      window.subcategoriasData = data.subcategorias;
    });
}

document.getElementById('salidaCategoria').addEventListener('change', function() {
  const subs = (window.subcategoriasData || []).filter(s => s.categoria === this.value);
  document.getElementById('salidaSubcategoria').innerHTML =
    subs.map(s => `<option value="${s.nombre}">${s.nombre}</option>`).join('');
});

// ===== PENDIENTES =====
function cargarPendientes() {
  fetch(`${API}/api/pendientes`)
    .then(r => r.json())
    .then(pendientes => {
      const tabla = document.getElementById('tablaPendientes');
      const titulo = document.querySelector('.titulo-pendientes');

      if (!pendientes || pendientes.length === 0) {
        tabla.innerHTML = '<div class="mensaje-vacio">No hay pagos pendientes</div>';
        if (titulo) titulo.textContent = 'Pendientes de Pago ($0)';
        return;
      }

      const total = pendientes.reduce((s, p) => s + (p.faltante || 0), 0);
      if (titulo) titulo.textContent = `Pendientes de Pago ($${total.toLocaleString('es-CO')})`;

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
          <div class="categoria">
            <div class="categoria-header" onclick="toggleCategoria(this)">
              <span>${cat} ($${totalCat.toLocaleString('es-CO')})</span>
              <span class="arrow">▼</span>
            </div>
            <div class="categoria-body">
              ${grupos[cat].map(p => `
                <div class="pendiente-item">
                  <div class="pendiente-info">
                    <div class="pendiente-descripcion">${escapeHtml(p.descripcion)} ($${p.montoMensual.toLocaleString('es-CO')})</div>
                    <div class="pendiente-fecha">Vence: ${p.fecha}</div>
                  </div>
                  <div class="pendiente-monto">$${p.faltante.toLocaleString('es-CO')}</div>
                </div>`).join('')}
            </div>
          </div>`;
      });

      tabla.innerHTML = html;
    });
}

function toggleCategoria(element) {
  const body = element.nextElementSibling;
  const arrow = element.querySelector('.arrow');
  const isOpen = body.classList.toggle('open');
  arrow.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
}

// ===== MODAL INGRESO =====
function limpiarFormulario(modalId) {
  const modal = document.getElementById(modalId);
  modal.querySelectorAll('input[type="text"],input[type="number"],input[type="date"]').forEach(i => i.value = '');
  modal.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
  if (modalId === 'modalSalida') document.getElementById('salidaSubcategoria').innerHTML = '';
}

document.querySelector('.btn-float.plus').addEventListener('click', () => {
  limpiarFormulario('modalIngreso');
  document.getElementById('ingresoFecha').value = obtenerFechaActual();
  document.getElementById('modalIngreso').style.display = 'block';
  cerrarMenu();
});

document.getElementById('btnCancelarIngreso').addEventListener('click', () => {
  document.getElementById('modalIngreso').style.display = 'none';
  restaurarBotonIngreso();
});

document.getElementById('btnGuardarIngreso').addEventListener('click', function() {
  if (this.dataset.modo === 'edicion') { actualizarMovimiento(); return; }

  const ingreso = {
    fecha: document.getElementById('ingresoFecha').value,
    hora: obtenerHoraActual(),
    descripcion: document.getElementById('ingresoDescripcion').value.trim(),
    categoria: document.getElementById('ingresoCategoria').value,
    monto: parseFloat(document.getElementById('ingresoMonto').value || 0),
    cuenta: document.getElementById('ingresoCuenta').value
  };

  if (!ingreso.fecha || !ingreso.descripcion || ingreso.monto <= 0) {
    alert('Completa todos los campos correctamente'); return;
  }

  this.disabled = true; this.textContent = 'Guardando...';

  fetch(`${API}/api/ingresos`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(ingreso)
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      document.getElementById('modalIngreso').style.display = 'none';
      alert('Ingreso guardado ✅');
      limpiarFormulario('modalIngreso');
      cargarTotales();
      cargarMovimientos(true);
    } else { alert('Error: ' + res.message); }
    restaurarBotonIngreso();
  });
});

function restaurarBotonIngreso() {
  const btn = document.getElementById('btnGuardarIngreso');
  btn.disabled = false; btn.textContent = 'Guardar';
  btn.style.opacity = '1'; btn.dataset.modo = '';
  movimientoEditando = null;
}

// ===== MODAL SALIDA =====
document.querySelector('.btn-float.minus').addEventListener('click', () => {
  limpiarFormulario('modalSalida');
  document.getElementById('salidaFecha').value = obtenerFechaActual();
  document.getElementById('modalSalida').style.display = 'block';
  cerrarMenu();
});

document.getElementById('btnCancelarSalida').addEventListener('click', () => {
  document.getElementById('modalSalida').style.display = 'none';
  restaurarBotonSalida();
});

document.getElementById('btnGuardarSalida').addEventListener('click', function() {
  if (this.dataset.modo === 'edicion') { actualizarMovimiento(); return; }

  const salida = {
    fecha: document.getElementById('salidaFecha').value,
    hora: obtenerHoraActual(),
    descripcion: document.getElementById('salidaDescripcion').value.trim(),
    categoria: document.getElementById('salidaCategoria').value,
    subcategoria: document.getElementById('salidaSubcategoria').value || '',
    monto: parseFloat(document.getElementById('salidaMonto').value || 0),
    cuenta: document.getElementById('salidaCuenta').value
  };

  if (!salida.fecha || !salida.descripcion || salida.monto <= 0) {
    alert('Completa todos los campos correctamente'); return;
  }

  this.disabled = true; this.textContent = 'Guardando...';

  fetch(`${API}/api/salidas`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(salida)
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      document.getElementById('modalSalida').style.display = 'none';
      alert('Salida guardada ✅');
      limpiarFormulario('modalSalida');
      cargarTotales();
      cargarMovimientos(true);
    } else { alert('Error: ' + res.message); }
    restaurarBotonSalida();
  });
});

function restaurarBotonSalida() {
  const btn = document.getElementById('btnGuardarSalida');
  btn.disabled = false; btn.textContent = 'Guardar';
  btn.style.opacity = '1'; btn.dataset.modo = '';
  movimientoEditando = null;
}

// ===== ACTUALIZAR MOVIMIENTO =====
function actualizarMovimiento() {
  const mov = movimientoEditando;
  if (!mov) return;

  const tipo = mov.tipo;
  const datos = tipo === 'INGRESO' ? {
    fecha: document.getElementById('ingresoFecha').value,
    hora: obtenerHoraActual(),
    descripcion: document.getElementById('ingresoDescripcion').value.trim(),
    categoria: document.getElementById('ingresoCategoria').value,
    monto: parseFloat(document.getElementById('ingresoMonto').value || 0),
    cuenta: document.getElementById('ingresoCuenta').value
  } : {
    fecha: document.getElementById('salidaFecha').value,
    hora: obtenerHoraActual(),
    descripcion: document.getElementById('salidaDescripcion').value.trim(),
    categoria: document.getElementById('salidaCategoria').value,
    subcategoria: document.getElementById('salidaSubcategoria').value || '',
    monto: parseFloat(document.getElementById('salidaMonto').value || 0),
    cuenta: document.getElementById('salidaCuenta').value
  };

  fetch(`${API}/api/movimientos/${tipo}/${mov.id}`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(datos)
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      document.getElementById(tipo === 'INGRESO' ? 'modalIngreso' : 'modalSalida').style.display = 'none';
      alert('Movimiento actualizado ✅');
      cargarTotales();
      cargarMovimientos(true);
    } else { alert('Error: ' + res.message); }
    tipo === 'INGRESO' ? restaurarBotonIngreso() : restaurarBotonSalida();
  });
}

// ===== MODAL TRANSFERENCIA =====
document.querySelector('.btn-float.transfer').addEventListener('click', () => {
  limpiarFormulario('modalTransferencia');
  document.getElementById('modalTransferencia').style.display = 'block';
  cerrarMenu();
});

document.getElementById('btnCancelarTransferencia').addEventListener('click', () => {
  document.getElementById('modalTransferencia').style.display = 'none';
});

document.getElementById('btnGuardarTransferencia').addEventListener('click', function() {
  const cuentaOrigen = document.getElementById('transferenciaCuentaOrigen').value;
  const cuentaDestino = document.getElementById('transferenciaCuentaDestino').value;
  const monto = parseFloat(document.getElementById('transferenciaMonto').value || 0);
  const descripcion = document.getElementById('transferenciaDescripcion').value || 'Transferencia';

  if (cuentaOrigen === cuentaDestino) { alert('No puedes transferir a la misma cuenta'); return; }
  if (monto <= 0) { alert('El monto debe ser mayor a cero'); return; }

  this.disabled = true; this.textContent = 'Transfiriendo...';

  fetch(`${API}/api/transferencia`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ cuentaOrigen, cuentaDestino, monto, descripcion })
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      document.getElementById('modalTransferencia').style.display = 'none';
      alert(`Transferencia exitosa ✅`);
      cargarTotales();
      cargarMovimientos(true);
    } else { alert('Error: ' + res.message); }
    this.disabled = false; this.textContent = 'Transferir';
  });
});

// ===== MODAL PENDIENTES =====
document.querySelector('.btn-float.edit').addEventListener('click', () => {
  document.getElementById('modalPendientes').style.display = 'block';
  cargarPendientesParaEdicion();
  cerrarMenu();
});

document.getElementById('btnCancelarPendiente').addEventListener('click', () => {
  document.getElementById('modalPendientes').style.display = 'none';
});

function cargarPendientesParaEdicion() {
  fetch(`${API}/api/pendientes`)
    .then(r => r.json())
    .then(pendientes => {
      pendientesCache = pendientes || [];
      const container = document.getElementById('listaPendientesContainer');

      if (!pendientesCache.length) {
        container.innerHTML = '<div class="mensaje-vacio">No hay pendientes</div>'; return;
      }

      const grupos = {};
      pendientesCache.forEach(p => {
        const cat = p.categoria || 'Sin categoría';
        if (!grupos[cat]) grupos[cat] = [];
        grupos[cat].push(p);
      });

      let html = '';
      Object.keys(grupos).sort((a,b) => a.localeCompare(b,'es',{sensitivity:'base'})).forEach(cat => {
        html += `<h3 style="color:#004481;margin-top:20px;">${cat}</h3>`;
        grupos[cat].forEach(p => {
          const bloqueado = p.faltante <= 0 ? 'disabled' : '';
          html += `
            <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eee;padding:10px 0;">
              <div style="flex:1;">
                <div style="font-weight:600;">${escapeHtml(p.descripcion)}</div>
                <div style="font-size:13px;color:#666;">Vence: ${p.fecha} – Restante: <b>$${Number(p.faltante).toLocaleString('es-CO')}</b></div>
              </div>
              <input type="number" data-id="${p.id}" ${bloqueado}
                placeholder="Abonar" min="0" step="0.01"
                style="width:110px;padding:8px;border-radius:8px;border:1px solid #ccc;font-size:16px;margin-left:12px;">
            </div>`;
        });
      });
      container.innerHTML = html;
    });
}

document.getElementById('btnGuardarAbonos').addEventListener('click', function() {
  const inputs = document.getElementById('listaPendientesContainer').querySelectorAll('input[data-id]');
  const items = [];
  inputs.forEach(input => {
    if (input.disabled) return;
    const valor = parseFloat(input.value || 0);
    if (valor > 0) items.push({ id: parseInt(input.getAttribute('data-id')), incrementoAbono: valor });
  });

  if (items.length === 0) { alert('No hay abonos para guardar.'); return; }

  this.disabled = true; this.textContent = 'Guardando...';

  fetch(`${API}/api/pendientes/abono`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ items })
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      alert(`Abonos guardados: ${res.updatedCount}`);
      document.getElementById('modalPendientes').style.display = 'none';
      cargarPendientes();
    } else { alert('Error al guardar'); }
    this.disabled = false; this.textContent = 'Guardar Abonos';
  });
});

document.getElementById('btnReiniciarPendientes').addEventListener('click', () => {
  if (!confirm('¿Seguro que deseas reiniciar todos los abonos del mes?')) return;
  fetch(`${API}/api/pendientes/reiniciar`, { method: 'POST' })
    .then(r => r.json())
    .then(res => {
      alert(res.message);
      document.getElementById('modalPendientes').style.display = 'none';
      cargarPendientes();
    });
});

// ===== MENÚ FLOTANTE =====
function inicializarMenuFlotante() {
  const btnMenu = document.getElementById('btnMenuPrincipal');
  const menuOpciones = document.getElementById('menuOpciones');
  let menuAbierto = false;

  btnMenu.addEventListener('click', () => {
    menuAbierto = !menuAbierto;
    btnMenu.classList.toggle('active', menuAbierto);
    menuOpciones.classList.toggle('visible', menuAbierto);
  });

  document.querySelector('.btn-float.refresh').addEventListener('click', () => {
    refrescarDatos(); cerrarMenu();
  });

  document.addEventListener('click', e => {
    if (!document.querySelector('.floating-menu').contains(e.target) && menuAbierto) cerrarMenu();
  });
}

function cerrarMenu() {
  document.getElementById('btnMenuPrincipal').classList.remove('active');
  document.getElementById('menuOpciones').classList.remove('visible');
}

function refrescarDatos() {
  const msg = document.createElement('div');
  msg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,68,129,0.95);color:white;padding:20px 40px;border-radius:15px;font-size:18px;font-weight:600;z-index:10000;';
  msg.textContent = '🔄 Refrescando datos...';
  document.body.appendChild(msg);
  cargarTotales(); cargarMovimientos(true); cargarPendientes();
  setTimeout(() => { msg.style.opacity='0'; setTimeout(() => document.body.removeChild(msg), 300); }, 1500);
}

// ===== CONFIGURACIÓN =====
document.getElementById('btnConfig').addEventListener('click', () => {
  document.getElementById('modalConfig').style.display = 'block';
});

document.getElementById('btnCerrarConfig').addEventListener('click', () => {
  document.getElementById('modalConfig').style.display = 'none';
});

document.getElementById('modalConfig').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalConfig')) {
    document.getElementById('modalConfig').style.display = 'none';
  }
});

function abrirSeccion(seccion) {
  document.getElementById('modalConfig').style.display = 'none';
  if (seccion === 'cuentas') abrirModalCuentas();
  if (seccion === 'pendientes') abrirModalGestionPendientes();
}

// ===== MODAL CUENTAS =====
function abrirModalCuentas() {
  document.getElementById('modalCuentas').style.display = 'block';
  cargarListaCuentas();
}

function cargarListaCuentas() {
  fetch(`${API}/api/cuentas`)
    .then(r => r.json())
    .then(cuentas => {
      const lista = document.getElementById('listaCuentas');
      lista.innerHTML = cuentas.map(c => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #eee;">
          <span style="font-size:17px;font-weight:500;">${c}</span>
          <button onclick="eliminarCuenta('${c}')" 
            style="background:#cc0000;color:white;border:none;border-radius:8px;padding:8px 12px;font-size:14px;cursor:pointer;">
            🗑 Eliminar
          </button>
        </div>
      `).join('');
    });
}

function eliminarCuenta(nombre) {
  if (!confirm(`¿Eliminar la cuenta "${nombre}"?`)) return;
  fetch(`${API}/api/cuentas/${nombre}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        alert('Cuenta eliminada ✅');
        cargarListaCuentas();
        cargarCuentas(() => cargarTotales());
      } else {
        alert('Error al eliminar');
      }
    });
}

document.getElementById('btnAgregarCuenta').addEventListener('click', () => {
  const input = document.getElementById('nuevaCuenta');
  const nombre = input.value.trim().toUpperCase();
  if (!nombre) { alert('Escribe el nombre de la cuenta'); return; }

  fetch(`${API}/api/cuentas`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ nombre })
  })
  .then(r => r.json())
  .then(res => {
    if (res.success) {
      alert('Cuenta agregada ✅');
      input.value = '';
      cargarListaCuentas();
      cargarCuentas(() => cargarTotales());
    } else {
      alert('Error: ' + res.message);
    }
  });
});

document.getElementById('btnCerrarCuentas').addEventListener('click', () => {
  document.getElementById('modalCuentas').style.display = 'none';
});

// ===== GESTIÓN PENDIENTES =====
function abrirModalGestionPendientes() {
  document.getElementById('modalGestionPendientes').style.display = 'block';
  cargarGestionPendientes();
}

function cargarGestionPendientes() {
  fetch(`${API}/api/pendientes/cats`)
    .then(r => r.json())
    .then(cats => {
      // Cargar categorías en el select
      const select = document.getElementById('pendienteCategoria');
      select.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    });

    fetch(`${API}/api/pendientes/all`)
    .then(r => r.json())
    .then(pendientes => {
      const lista = document.getElementById('listaGestionPendientes');

      if (!pendientes.length) {
        lista.innerHTML = '<div class="mensaje-vacio">No hay pendientes</div>';
        return;
      }

      // Agrupar por categoría
      const grupos = {};
      pendientes.forEach(p => {
        const cat = p.categoria || 'Sin categoría';
        if (!grupos[cat]) grupos[cat] = [];
        grupos[cat].push(p);
      });

      let html = '';
      Object.keys(grupos).sort((a,b) => a.localeCompare(b,'es',{sensitivity:'base'})).forEach(cat => {
        html += `
          <div style="margin-bottom:15px;">
            <div style="display:flex;justify-content:space-between;align-items:center;background:#004481;color:white;padding:12px 15px;border-radius:10px 10px 0 0;">
              <span style="font-weight:600;font-size:16px;">${cat}</span>
              <button onclick="eliminarCategoriaPendiente('${cat}')"
                style="background:rgba(255,255,255,0.2);color:white;border:none;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;">
                🗑 Eliminar sección
              </button>
            </div>
            <div style="background:white;border-radius:0 0 10px 10px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
              ${grupos[cat].map(p => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 15px;border-bottom:1px solid #f0f0f0;">
                  <div>
                    <div style="font-weight:600;font-size:15px;">${escapeHtml(p.descripcion)}</div>
                    <div style="font-size:13px;color:#666;">$${p.montoMensual.toLocaleString('es-CO')} · Vence: ${p.fecha} ${p.pagado === 'OK' ? '✅' : '⏳'}</div>
                  </div>
                  <div style="display:flex;gap:8px;">
                    <button onclick="editarPendienteForm(${p.id},'${escapeHtml(p.descripcion)}',${p.montoMensual},'${p.fecha}','${p.categoria}')"
                      style="background:#ffa500;color:white;border:none;border-radius:8px;padding:8px 10px;font-size:14px;cursor:pointer;">✎</button>
                    <button onclick="eliminarPendienteById(${p.id})"
                      style="background:#cc0000;color:white;border:none;border-radius:8px;padding:8px 10px;font-size:14px;cursor:pointer;">🗑</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>`;
      });

      lista.innerHTML = html;
    });
}

function mostrarFormNuevoPendiente() {
  document.getElementById('pendienteEditId').value = '';
  document.getElementById('pendienteDesc').value = '';
  document.getElementById('pendienteMonto').value = '';
  document.getElementById('pendienteFecha').value = '';
  document.getElementById('tituloPendienteForm').textContent = 'Nuevo Pendiente';
  document.getElementById('inputNuevaCategoria').style.display = 'none';
  document.getElementById('nuevaCategoriaP').value = '';

  // Recargar categorías antes de mostrar el form
  fetch(`${API}/api/pendientes/cats`)
    .then(r => r.json())
    .then(cats => {
      const select = document.getElementById('pendienteCategoria');
      select.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
      document.getElementById('formPendiente').style.display = 'block';
    });
}

function editarPendienteForm(id, desc, monto, fecha, categoria) {
  document.getElementById('pendienteEditId').value = id;
  document.getElementById('pendienteDesc').value = desc;
  document.getElementById('pendienteMonto').value = monto;
  document.getElementById('pendienteFecha').value = fecha;
  document.getElementById('pendienteCategoria').value = categoria;
  document.getElementById('tituloPendienteForm').textContent = 'Editar Pendiente';
  document.getElementById('formPendiente').style.display = 'block';
  document.getElementById('inputNuevaCategoria').style.display = 'none';
  document.getElementById('formPendiente').scrollIntoView({ behavior: 'smooth' });
}

function cancelarFormPendiente() {
  document.getElementById('formPendiente').style.display = 'none';
}

function mostrarInputNuevaCategoria() {
  document.getElementById('inputNuevaCategoria').style.display = 'block';
}

function guardarPendiente() {
  const id = document.getElementById('pendienteEditId').value;
  const descripcion = document.getElementById('pendienteDesc').value.trim();
  const montoMensual = parseFloat(document.getElementById('pendienteMonto').value || 0);
  const fecha = document.getElementById('pendienteFecha').value.trim();
  const nuevaCat = document.getElementById('nuevaCategoriaP').value.trim().toUpperCase();
  const categoria = nuevaCat || document.getElementById('pendienteCategoria').value;

  if (!descripcion || montoMensual <= 0) {
    alert('Completa descripción y monto'); return;
  }

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
      alert(id ? 'Pendiente actualizado ✅' : 'Pendiente agregado ✅');
      document.getElementById('formPendiente').style.display = 'none';
      document.getElementById('nuevaCategoriaP').value = '';
      cargarGestionPendientes();
      cargarPendientes();
    } else {
      alert('Error: ' + res.message);
    }
  });
}

function eliminarPendienteById(id) {
  if (!confirm('¿Eliminar este pendiente?')) return;
  fetch(`${API}/api/pendientes/${id}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        alert('Pendiente eliminado ✅');
        cargarGestionPendientes();
        cargarPendientes();
      }
    });
}

function eliminarCategoriaPendiente(cat) {
  if (!confirm(`¿Eliminar la sección "${cat}" y todos sus pendientes?`)) return;
  fetch(`${API}/api/pendientes/categoria/${encodeURIComponent(cat)}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        alert(`Sección "${cat}" eliminada ✅`);
        cargarGestionPendientes();
        cargarPendientes();
      }
    });
}

document.getElementById('btnCerrarGestionPendientes').addEventListener('click', () => {
  document.getElementById('modalGestionPendientes').style.display = 'none';
});

// Actualizar abrirSeccion para pendientes
const _abrirSeccionOriginal = abrirSeccion;