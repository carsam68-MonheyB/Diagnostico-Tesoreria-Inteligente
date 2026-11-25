/* =========================================================================
   Diagnóstico de tesorería — lógica del formulario por pasos
   Sin dependencias externas. Todo se procesa en el navegador hasta que la
   persona presiona "Enviar diagnóstico".
   ========================================================================= */
(function () {
  'use strict';

  // ---------------------------------------------------------------- Constantes
  var AVISO_VERSION = '0.1-borrador';        // Debe coincidir con aviso-de-privacidad.html
  var FORM_VERSION = '1.0';
  var NETLIFY_FORM = 'diagnostico-tesoreria';
  var BORRADOR_KEY = 'diagnostico-tesoreria:borrador:v1';
  var MAX_BYTES = 8 * 1024 * 1024;           // Límite de Netlify por envío
  var EXT_PERMITIDAS = ['.txt', '.csv', '.xlsx', '.xls', '.xml', '.pdf', '.zip'];

  // Catálogos de opciones: assets/js/catalogos.js (compartido con diagnostico.html)
  var OPC = window.DT_OPC || {};

  // ---------------------------------------------------------------- Utilidades
  var form = document.getElementById('wizard');
  if (!form) return;
  var pasos = Array.prototype.slice.call(form.querySelectorAll('.paso'));
  var ULTIMO = pasos.length - 1;
  var pasoActual = 0;
  var uidSeq = 0;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function el(tag, attrs, hijos) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (hijos || []).forEach(function (h) { if (h != null) e.appendChild(typeof h === 'string' ? document.createTextNode(h) : h); });
    return e;
  }
  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setPath(obj, path, val) {
    var partes = path.split('.');
    var o = obj;
    for (var i = 0; i < partes.length - 1; i++) {
      if (o[partes[i]] == null || typeof o[partes[i]] !== 'object') o[partes[i]] = {};
      o = o[partes[i]];
    }
    o[partes[partes.length - 1]] = val;
  }
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
  function fmtNum(n, dec) {
    if (n == null || n === '' || isNaN(n)) return '';
    return Number(n).toLocaleString('es-MX', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec == null ? 4 : dec });
  }
  function fmtFecha(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  }
  function isoLocal(d) {
    function dos(n) { return String(n).padStart(2, '0'); }
    var off = -d.getTimezoneOffset();
    var signo = off >= 0 ? '+' : '-';
    off = Math.abs(off);
    return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + 'T' + dos(d.getHours()) + ':' +
      dos(d.getMinutes()) + ':' + dos(d.getSeconds()) + signo + dos(Math.floor(off / 60)) + ':' + dos(off % 60);
  }
  function fmtBytes(b) { return b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.ceil(b / 1024) + ' KB'; }
  function textoEtiqueta(nodo) {
    if (!nodo) return '';
    var c = nodo.cloneNode(true);
    $$('.req, .nota, .ayuda', c).forEach(function (x) { x.remove(); });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }

  // ---------------------------------------------------------------- Almacenamiento seguro
  var almacen = {
    leer: function () { try { var t = window.localStorage.getItem(BORRADOR_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; } },
    guardar: function (v) { try { window.localStorage.setItem(BORRADOR_KEY, JSON.stringify(v)); return true; } catch (e) { return false; } },
    borrar: function () { try { window.localStorage.removeItem(BORRADOR_KEY); } catch (e) { /* sin acceso */ } }
  };

  // ---------------------------------------------------------------- Construcción de opciones
  function construirOpciones(raiz, uid) {
    $$('select[data-opc]', raiz).forEach(function (s) {
      if (s.options.length) return;
      s.appendChild(el('option', { value: '', text: 'Selecciona…' }));
      (OPC[s.dataset.opc] || []).forEach(function (o) { s.appendChild(el('option', { value: o[0], text: o[1] })); });
    });
    $$('select[data-dyn]', raiz).forEach(function (s) {
      if (!s.options.length) s.appendChild(el('option', { value: '', text: 'Selecciona…' }));
    });
    $$('.opciones[data-grupo]', raiz).forEach(function (cont) {
      if (cont.dataset.listo) return;
      cont.dataset.listo = '1';
      if (cont.dataset.dyn) return; // se llena con refrescarDinamicos()
      var clave = cont.dataset.grupo;
      var tipo = cont.dataset.tipo;
      var nombre = clave + (uid ? '__' + uid : '');
      (OPC[cont.dataset.opc] || []).forEach(function (o) {
        if (tipo === 'conteo') {
          var chk = el('input', { type: 'checkbox', value: o[0], 'data-k': clave });
          var num = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder: 'Pagos al mes', 'data-k': cont.dataset.conteo + '.' + o[0] });
          cont.appendChild(el('div', { class: 'conteo-fila' }, [
            el('label', { class: 'opcion' }, [chk, el('span', { text: o[1] })]),
            el('label', { class: 'conteo-num', 'data-si': clave + ':' + o[0] }, [el('span', { class: 'sr-only', text: 'Pagos al mes de ' + o[1] }), num])
          ]));
        } else {
          var inp = el('input', { type: tipo, name: nombre, value: o[0], 'data-k': clave });
          cont.appendChild(el('label', { class: 'opcion' }, [inp, el('span', { text: o[1] })]));
        }
      });
    });
  }

  // ---------------------------------------------------------------- Controles y lectura/escritura
  function controles(scope) {
    var esItem = scope.classList && scope.classList.contains('rep-item');
    return $$('[data-k]', scope).filter(function (c) {
      if (!/^(INPUT|SELECT|TEXTAREA)$/.test(c.tagName)) return false;
      var item = c.closest('.rep-item');
      return esItem ? item === scope : item === null;
    });
  }
  function scopeDe(nodo) { return (nodo.parentElement && nodo.parentElement.closest('.rep-item')) || form; }

  function valorClave(scope, clave) {
    var cs = controles(scope).filter(function (c) { return c.dataset.k === clave; });
    if (!cs.length) return undefined;
    if (cs[0].type === 'checkbox') return cs.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
    if (cs[0].type === 'radio') { var r = cs.filter(function (c) { return c.checked; })[0]; return r ? r.value : ''; }
    return cs[0].value;
  }

  function leerScope(scope, todo) {
    var obj = {};
    controles(scope).forEach(function (c) {
      if (!todo && c.matches(':disabled')) return;
      var k = c.dataset.k;
      if (c.type === 'file') return;
      if (c.type === 'checkbox') {
        var arr = getPath(obj, k) || [];
        if (c.checked) arr.push(c.value);
        setPath(obj, k, arr);
      } else if (c.type === 'radio') {
        if (c.checked) setPath(obj, k, c.value);
        else if (getPath(obj, k) === undefined) setPath(obj, k, null);
      } else if (c.type === 'number') {
        setPath(obj, k, c.value === '' ? null : Number(c.value));
      } else if (k === 'tasa_nominal') {
        setPath(obj, k, c.value === '' ? null : Number(c.value));
      } else {
        setPath(obj, k, c.value.trim());
      }
    });
    $$('[data-repeat]', scope).forEach(function (cont) {
      if (scope === form && cont.closest('.rep-item')) return;
      if (!todo && cont.closest('[data-si][hidden]')) return;
      var items = $$('.rep-item', cont).filter(function (i) { return i.parentElement.closest('[data-repeat]') === cont; });
      setPath(obj, cont.dataset.repeat, items.map(function (i) { return leerScope(i, todo); }));
    });
    return obj;
  }

  function escribirScope(scope, obj) {
    $$('[data-repeat]', scope).forEach(function (cont) {
      if (scope === form && cont.closest('.rep-item')) return;
      var arr = getPath(obj, cont.dataset.repeat);
      if (!Array.isArray(arr)) return;
      $('.rep-lista', cont).innerHTML = '';
      arr.forEach(function (d) { agregarItem(cont, d); });
    });
    controles(scope).forEach(function (c) {
      var v = getPath(obj, c.dataset.k);
      if (v === undefined || c.type === 'file') return;
      if (c.type === 'checkbox') c.checked = Array.isArray(v) && v.indexOf(c.value) >= 0;
      else if (c.type === 'radio') c.checked = v === c.value;
      else if (c.tagName === 'SELECT') {
        c.dataset.pendiente = v == null ? '' : v;
        c.value = v == null ? '' : v;
      } else c.value = v == null ? '' : v;
    });
  }

  // ---------------------------------------------------------------- Secciones repetibles
  function agregarItem(cont, datos) {
    var tpl = document.getElementById(cont.dataset.tpl);
    var uid = 'i' + (++uidSeq);
    var item = el('div', { class: 'rep-item', 'data-uid': uid });
    var titulo = el('h4', { text: '' });
    var quitar = el('button', { type: 'button', class: 'btn btn-peligro btn-chico', 'data-quitar': '' }, ['Quitar']);
    item.appendChild(el('div', { class: 'rep-item-cab' }, [titulo, quitar]));
    item.appendChild(tpl.content.cloneNode(true));
    construirOpciones(item, uid);
    $('.rep-lista', cont).appendChild(item);
    refrescarDinamicos(item);
    if (datos) escribirScope(item, datos);
    renumerar(cont);
    return item;
  }
  function renumerar(cont) {
    var items = $$('.rep-item', cont);
    items.forEach(function (it, i) {
      var t = cont.dataset.titulo + ' ' + (i + 1);
      $('.rep-item-cab h4', it).textContent = t;
      $('[data-quitar]', it).setAttribute('aria-label', 'Quitar ' + t);
    });
    var vacio = $('.rep-vacio', cont);
    if (!items.length && !vacio) $('.rep-lista', cont).appendChild(el('p', { class: 'rep-vacio', text: 'Aún no hay registros. Use el botón para agregar.' }));
    if (items.length && vacio) vacio.remove();
  }

  // ---------------------------------------------------------------- Listas dinámicas (empresas, bancos, créditos)
  function listaEmpresas() {
    return $$('[data-repeat="empresas.lista"] .rep-item').map(function (it, i) {
      var n = ($('[data-k="razon_social"]', it) || {}).value || '';
      return n.trim() || ('Empresa ' + (i + 1) + ' (sin nombre)');
    });
  }
  function listaBancos() {
    var vistos = {};
    var res = [];
    $$('[data-repeat="cuentas.lista"] [data-k="banco"]').forEach(function (i) {
      var v = i.value.trim();
      if (v && !vistos[norm(v)]) { vistos[norm(v)] = 1; res.push(v); }
    });
    return res;
  }
  function listaCreditos() {
    return $$('[data-repeat="creditos.lista"] .rep-item').map(function (it, i) {
      var tipo = $('[data-k="tipo"]', it);
      var banco = ($('[data-k="banco"]', it) || {}).value || '';
      var mon = ($('[data-k="moneda"]', it) || {}).value || '';
      var tTxt = tipo && tipo.selectedIndex > 0 ? tipo.options[tipo.selectedIndex].text : '';
      return { valor: 'credito_' + (i + 1), texto: 'Crédito ' + (i + 1) + (tTxt ? ' – ' + tTxt : '') + (banco ? ' – ' + banco : '') + (mon ? ' (' + mon + ')' : '') };
    });
  }
  function refrescarDinamicos(raiz) {
    raiz = raiz || form;
    var empresas = listaEmpresas();
    var creditos = listaCreditos();
    $$('select[data-dyn]', raiz).forEach(function (s) {
      var actual = s.value || s.dataset.pendiente || '';
      var ops = s.dataset.dyn === 'empresas'
        ? empresas.map(function (e) { return { valor: e, texto: e }; })
        : creditos.concat([{ valor: 'no_ligado', texto: 'No está ligada a un crédito específico' }]);
      s.innerHTML = '';
      s.appendChild(el('option', { value: '', text: 'Selecciona…' }));
      ops.forEach(function (o) { s.appendChild(el('option', { value: o.valor, text: o.texto })); });
      if (actual && !ops.some(function (o) { return o.valor === actual; })) {
        s.appendChild(el('option', { value: actual, text: actual + ' (ya no está en la lista)' }));
      }
      s.value = actual;
    });
    $$('.opciones[data-dyn="bancos"]', raiz).forEach(function (cont) {
      var marcados = $$('input', cont).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      if (cont.dataset.pendiente) { try { marcados = marcados.concat(JSON.parse(cont.dataset.pendiente)); } catch (e) { /* ignorar */ } }
      var bancos = listaBancos();
      marcados.forEach(function (m) { if (bancos.indexOf(m) < 0) bancos.push(m); });
      cont.innerHTML = '';
      if (!bancos.length) cont.appendChild(el('p', { class: 'nota', text: 'No capturó bancos en el paso 3. Escríbalos en el campo de abajo.' }));
      bancos.forEach(function (b) {
        var inp = el('input', { type: 'checkbox', value: b, 'data-k': cont.dataset.grupo });
        inp.checked = marcados.indexOf(b) >= 0;
        cont.appendChild(el('label', { class: 'opcion' }, [inp, el('span', { text: b })]));
      });
      delete cont.dataset.pendiente;
    });
  }

  // ---------------------------------------------------------------- Campos condicionales
  function evaluarCondiciones() {
    $$('[data-si]', form).forEach(function (nodo) {
      var partes = nodo.dataset.si.split(':');
      var clave = partes[0];
      var valores = (partes[1] || '').split('|');
      var v = valorClave(scopeDe(nodo), clave);
      var coincide = Array.isArray(v) ? v.some(function (x) { return valores.indexOf(x) >= 0; }) : valores.indexOf(v) >= 0;
      var padreOculto = nodo.parentElement && nodo.parentElement.closest('[data-si][hidden]');
      var visible = coincide && !padreOculto;
      nodo.hidden = !visible;
      $$('input, select, textarea', nodo).forEach(function (c) { c.disabled = !visible; });
    });
  }

  // ---------------------------------------------------------------- Tasa nominal en créditos
  function calcularTasa(item) {
    var base = ($('[data-k="tasa_base"]', item) || {}).value;
    var out = $('[data-k="tasa_nominal"]', item);
    var exp = $('.tasa-explica', item);
    if (!out) return;
    var num = function (k) { var i = $('[data-k="' + k + '"]', item); return i && i.value !== '' ? Number(i.value) : null; };
    var res = null;
    var texto = '';
    if (base === 'fija') {
      res = num('tasa_fija');
      if (res != null) texto = 'Tasa fija: ' + fmtNum(res, 4) + ' % nominal anual.';
    } else if (base) {
      var sel = $('[data-k="tasa_base"]', item);
      var nombre = base === 'otra' ? (($('[data-k="tasa_base_otra"]', item) || {}).value || 'Tasa base') : sel.options[sel.selectedIndex].text;
      var bv = num('tasa_base_valor');
      var st = num('sobretasa_pp');
      if (bv != null && st != null) {
        res = Math.round((bv + st) * 10000) / 10000;
        texto = nombre + ' (' + fmtNum(bv, 4) + ' %) + ' + fmtNum(st, 4) + ' pp = ' + fmtNum(res, 4) + ' % nominal anual.';
      } else if (st != null) {
        texto = nombre + ' + ' + fmtNum(st, 4) + ' pp. Capture el valor vigente de la tasa base para calcular la tasa nominal anual.';
      }
    }
    out.value = res == null ? '' : String(res);
    exp.textContent = texto;
  }

  // ---------------------------------------------------------------- Validación
  function mostrarErrores(lista) {
    var caja = $('#errores');
    caja.innerHTML = '';
    if (!lista.length) { caja.hidden = true; return; }
    caja.appendChild(el('p', {}, [el('strong', { text: 'Revise estos campos antes de continuar:' })]));
    var ul = el('ul');
    lista.forEach(function (e) {
      var b = el('button', { type: 'button', class: 'btn-texto', text: e.texto });
      b.addEventListener('click', function () { if (e.foco) e.foco.focus(); });
      ul.appendChild(el('li', {}, [b]));
    });
    caja.appendChild(ul);
    caja.hidden = false;
    caja.focus();
  }
  function prefijoItem(c) {
    var it = c.closest('.rep-item');
    return it ? $('.rep-item-cab h4', it).textContent + ' – ' : '';
  }
  function validarPaso(n) {
    var sec = pasos[n];
    var errores = [];
    $$('[aria-invalid]', sec).forEach(function (x) { x.removeAttribute('aria-invalid'); });
    $$('input, select, textarea', sec).forEach(function (c) {
      if (c.matches(':disabled') || c.type === 'radio' || c.type === 'checkbox' || c.closest('.hp')) return;
      if (c.dataset.mensaje) c.setCustomValidity(c.validity.patternMismatch || c.validity.tooShort ? c.dataset.mensaje : '');
      if (!c.checkValidity()) {
        c.setAttribute('aria-invalid', 'true');
        var etq = textoEtiqueta(c.closest('label') && $('.etq', c.closest('label')));
        var motivo = c.validity.valueMissing ? 'obligatorio' : (c.validationMessage || 'valor no válido');
        errores.push({ texto: prefijoItem(c) + etq + ': ' + motivo, foco: c });
      }
    });
    $$('input[type=text], textarea', sec).forEach(function (c) {
      if (c.matches(':disabled') || c.closest('.hp') || c.dataset.k === 'rfc') return;
      if (pareceCuenta(c.value)) {
        c.setAttribute('aria-invalid', 'true');
        errores.push({ texto: prefijoItem(c) + textoEtiqueta(c.closest('label') && $('.etq', c.closest('label'))) + ': parece contener un número de cuenta, CLABE o tarjeta. Bórrelo; este cuestionario no debe incluir números de cuenta.', foco: c });
      }
    });
    $$('.opciones[data-min]', sec).forEach(function (cont) {
      if (cont.closest('[data-si][hidden]')) return;
      var marcados = $$('input[type=checkbox], input[type=radio]', cont).filter(function (c) { return c.checked; }).length;
      if (marcados < Number(cont.dataset.min)) {
        cont.setAttribute('aria-invalid', 'true');
        var fs = cont.closest('fieldset');
        var primero = $('input', cont);
        errores.push({ texto: prefijoItem(cont) + textoEtiqueta(fs && $('legend', fs)) + ': elija al menos una opción', foco: primero });
      }
    });
    $$('[data-repeat][data-min-items]', sec).forEach(function (cont) {
      if (cont.closest('[data-si][hidden]')) return;
      if ($$('.rep-item', cont).length < Number(cont.dataset.minItems)) {
        errores.push({ texto: 'Agregue al menos un registro de “' + cont.dataset.titulo + '”', foco: $('[data-add]', cont) });
      }
    });
    if (n === ULTIMO && !$('#consentimiento').checked) {
      errores.push({ texto: 'Para enviar, marque la casilla de consentimiento del aviso de privacidad', foco: $('#consentimiento') });
    }
    if (n === 13 || n === ULTIMO) {
      var t = revisarArchivos();
      if (t.error) errores.push({ texto: t.error, foco: t.foco });
    }
    mostrarErrores(errores);
    return !errores.length;
  }

  // ---------------------------------------------------------------- Navegación
  function irA(n, enfocar) {
    pasoActual = Math.max(0, Math.min(ULTIMO, n));
    pasos.forEach(function (p, i) {
      p.hidden = i !== pasoActual;
      p.classList.toggle('paso-actual', i === pasoActual);
    });
    refrescarDinamicos();
    evaluarCondiciones();
    if (pasoActual === 3) actualizarConteoCuentas();
    if (pasoActual === ULTIMO) construirResumen();
    if (pasoActual === 13 || pasoActual === ULTIMO) revisarArchivos();
    $('#btn-anterior').hidden = pasoActual === 0;
    $('#btn-siguiente').hidden = pasoActual === ULTIMO;
    $('#btn-enviar').hidden = pasoActual !== ULTIMO;
    $('#btn-siguiente').textContent = pasoActual === 0 ? 'Comenzar' : 'Siguiente';
    $('#avance-paso').textContent = 'Paso ' + pasoActual + ' de ' + ULTIMO;
    $('#avance-titulo').textContent = pasos[pasoActual].dataset.titulo;
    $('#avance-relleno').style.width = Math.round(pasoActual / ULTIMO * 100) + '%';
    $('.avance-barra').setAttribute('aria-valuenow', String(pasoActual));
    mostrarErrores([]);
    if (enfocar !== false) {
      var h = $('h2', pasos[pasoActual]);
      if (h) h.focus();
      window.scrollTo(0, 0);
    }
    guardarBorrador();
  }

  // ---------------------------------------------------------------- Borrador
  var tGuardar = null;
  var avisoSinAlmacen = false;
  var enviado = false;
  function guardarBorrador() {
    clearTimeout(tGuardar);
    if (enviado) return;
    tGuardar = setTimeout(function () {
      var ok = almacen.guardar({ version: FORM_VERSION, paso: pasoActual, guardado_en: new Date().toISOString(), datos: leerScope(form, true) });
      var est = $('#estado-borrador');
      if (ok) est.textContent = 'Borrador guardado en este navegador a las ' + new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) + '.';
      else if (!avisoSinAlmacen) { avisoSinAlmacen = true; est.textContent = 'Su navegador no permite guardar borradores; si cierra la página perderá lo capturado.'; }
    }, 400);
  }
  function restaurarBorrador() {
    var b = almacen.leer();
    if (!b || !b.datos) return;
    escribirScope(form, b.datos);
    var bancosH2h = getPath(b.datos, 'h2h.bancos');
    var contB = $('.opciones[data-dyn="bancos"]');
    if (contB && Array.isArray(bancosH2h)) contB.dataset.pendiente = JSON.stringify(bancosH2h);
    refrescarDinamicos();
    escribirScope(form, b.datos);    // segunda pasada: selects que dependen de listas dinámicas
    if (contB && Array.isArray(bancosH2h)) { contB.dataset.pendiente = JSON.stringify(bancosH2h); refrescarDinamicos(); }
    $$('[data-repeat="creditos.lista"] .rep-item').forEach(calcularTasa);
    evaluarCondiciones();
    var f = new Date(b.guardado_en);
    $('#borrador-fecha').textContent = isNaN(f) ? '' : f.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
    $('#banner-borrador').hidden = false;
    pasoActual = Math.min(Number(b.paso) || 0, ULTIMO);
  }

  // ---------------------------------------------------------------- Empresas y cuentas
  function sincronizarEmpresas() {
    var n = Number($('#empresas-numero').value || 0);
    var cont = $('[data-repeat="empresas.lista"]');
    var items = $$('.rep-item', cont).length;
    if (n > 0 && n <= 200) for (var i = items; i < n; i++) agregarItem(cont);
    items = $$('.rep-item', cont).length;
    var aviso = $('#empresas-aviso');
    if (n && items > n) { aviso.textContent = 'Hay ' + items + ' fichas y usted indicó ' + n + ' empresas. Quite las que sobran o corrija el número.'; aviso.hidden = false; }
    else aviso.hidden = true;
    evaluarCondiciones();
  }
  function actualizarConteoCuentas() {
    var n = Number(($('[data-k="cuentas.numero_total"]') || {}).value || 0);
    var cap = $$('[data-repeat="cuentas.lista"] [data-k="cantidad"]').reduce(function (a, i) { return a + (Number(i.value) || 0); }, 0);
    $('#cuentas-conteo').textContent = n ? 'Los grupos capturados suman ' + cap + ' de ' + n + ' cuentas.' : '';
  }
  // Detecta secuencias que parecen número de cuenta, CLABE o tarjeta (10 o más dígitos seguidos,
  // aunque estén separados por espacios o guiones).
  function pareceCuenta(texto) {
    return /\d(?:[\s-]?\d){9,}/.test(String(texto || ''));
  }

  // ---------------------------------------------------------------- Importación de plantilla de cuentas
  function buscarOpcion(lista, texto) {
    var t = norm(texto);
    if (!t) return '';
    var o = OPC[lista].filter(function (x) { return norm(x[0]) === t || norm(x[1]) === t || norm(x[1]).split(' – ')[0] === t; })[0];
    return o ? o[0] : '';
  }
  function importarFilas(filas) {
    if (!filas.length) throw new Error('El archivo no tiene filas.');
    var idx = -1;
    for (var i = 0; i < Math.min(filas.length, 15); i++) {
      if (filas[i].some(function (c) { return norm(c) === 'banco'; })) { idx = i; break; }
    }
    if (idx < 0) throw new Error('No encontramos el encabezado de la plantilla (debe tener una columna “Banco”).');
    var cab = filas[idx].map(norm);
    function col(nombres) { for (var j = 0; j < cab.length; j++) if (nombres.some(function (n) { return cab[j].indexOf(n) === 0; })) return j; return -1; }
    var c = {
      empresa: col(['empresa']), banco: col(['banco']), moneda: col(['moneda']), cantidad: col(['numero de cuentas', 'cantidad']),
      tipo: col(['tipo']), uso: col(['uso']), movs: col(['movimientos'])
    };
    var empresas = listaEmpresas();
    var cont = $('[data-repeat="cuentas.lista"]');
    var agregadas = 0, totalCuentas = 0, sinEmpresa = 0, usoDescartado = 0;
    filas.slice(idx + 1).forEach(function (f) {
      var val = function (j) { return j >= 0 && f[j] != null ? String(f[j]).trim() : ''; };
      if (!val(c.banco)) return;
      var cant = Math.round(Number(val(c.cantidad).replace(/[^\d.]/g, '')));
      if (!(cant >= 1)) cant = 1;
      totalCuentas += cant;
      var uso = val(c.uso);
      if (pareceCuenta(uso)) { uso = ''; usoDescartado++; }
      var emp = val(c.empresa);
      var empOk = empresas.filter(function (e) { return norm(e) === norm(emp); })[0] || '';
      if (emp && !empOk) sinEmpresa++;
      var mon = val(c.moneda).toUpperCase();
      var monOk = buscarOpcion('monedas', mon);
      var movs = val(c.movs).replace(/[^\d.]/g, '');
      agregarItem(cont, {
        empresa: empOk || emp, banco: val(c.banco),
        moneda: monOk || (mon ? 'otra' : ''), moneda_otra: monOk ? '' : mon,
        cantidad: cant, tipo: buscarOpcion('tipos_cuenta', val(c.tipo)),
        uso: uso, movimientos_mes: movs === '' ? null : Math.round(Number(movs))
      });
      agregadas++;
    });
    refrescarDinamicos();
    evaluarCondiciones();
    actualizarConteoCuentas();
    guardarBorrador();
    var msg = 'Se agregaron ' + agregadas + ' grupos (' + totalCuentas + ' cuentas). Revise cada ficha. Solo se leyeron las columnas de la plantilla.';
    if (usoDescartado) msg += ' En ' + usoDescartado + ' filas el “Uso principal” parecía contener un número de cuenta y se dejó en blanco.';
    if (sinEmpresa) msg += ' En ' + sinEmpresa + ' filas la empresa no coincide con las del paso 2: elíjala en la ficha.';
    return msg;
  }
  function decodificarTexto(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }
  function parsearCSV(texto) {
    texto = texto.replace(/^﻿/, '');
    var primera = texto.split(/\r?\n/)[0] || '';
    var sep = (primera.split(';').length > primera.split(',').length) ? ';' : ',';
    var filas = [], fila = [], campo = '', comillas = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (comillas) {
        if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
        else campo += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === sep) { fila.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        fila.push(campo); filas.push(fila); fila = []; campo = '';
      } else campo += ch;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }
  // Lector mínimo de .xlsx (zip + XML) usando DecompressionStream del navegador.
  function leerXlsx(buf) {
    var u8 = new Uint8Array(buf);
    var dv = new DataView(buf);
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) return Promise.reject(new Error('El archivo no parece un .xlsx válido.'));
    var n = dv.getUint16(eocd + 10, true);
    var off = dv.getUint32(eocd + 16, true);
    var entradas = {};
    var dec = new TextDecoder();
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
      entradas[dec.decode(u8.subarray(off + 46, off + 46 + nlen))] = { metodo: dv.getUint16(off + 10, true), tam: dv.getUint32(off + 20, true), loc: dv.getUint32(off + 42, true) };
      off += 46 + nlen + elen + clen;
    }
    function leer(nombre) {
      var e = entradas[nombre];
      if (!e) return Promise.resolve(null);
      var ini = e.loc + 30 + dv.getUint16(e.loc + 26, true) + dv.getUint16(e.loc + 28, true);
      var datos = u8.subarray(ini, ini + e.tam);
      if (e.metodo === 0) return Promise.resolve(dec.decode(datos));
      if (e.metodo !== 8 || typeof DecompressionStream === 'undefined') return Promise.reject(new Error('Su navegador no puede leer este .xlsx; guárdelo como CSV.'));
      return new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }
    var xml = function (t) { return new DOMParser().parseFromString(t, 'application/xml'); };
    return Promise.all([leer('xl/workbook.xml'), leer('xl/_rels/workbook.xml.rels'), leer('xl/sharedStrings.xml')]).then(function (r) {
      if (!r[0] || !r[1]) throw new Error('El archivo no parece un .xlsx válido.');
      var hojas = Array.prototype.slice.call(xml(r[0]).getElementsByTagName('sheet'));
      var hoja = hojas.filter(function (h) { return norm(h.getAttribute('name')) === 'cuentas'; })[0] || hojas[0];
      var rid = hoja.getAttribute('r:id');
      var rel = Array.prototype.slice.call(xml(r[1]).getElementsByTagName('Relationship')).filter(function (x) { return x.getAttribute('Id') === rid; })[0];
      var destino = rel.getAttribute('Target').replace(/^\//, '');
      if (destino.indexOf('xl/') !== 0) destino = 'xl/' + destino;
      var compartidas = r[2] ? Array.prototype.slice.call(xml(r[2]).getElementsByTagName('si')).map(function (si) {
        return Array.prototype.slice.call(si.getElementsByTagName('t')).filter(function (t) { return !t.closest || !t.closest('rPh'); }).map(function (t) { return t.textContent; }).join('');
      }) : [];
      return leer(destino).then(function (hx) {
        var filas = [];
        Array.prototype.slice.call(xml(hx).getElementsByTagName('row')).forEach(function (row) {
          var fila = [];
          Array.prototype.slice.call(row.getElementsByTagName('c')).forEach(function (c) {
            var ref = (c.getAttribute('r') || '').replace(/\d+/g, '');
            var col = 0;
            for (var q = 0; q < ref.length; q++) col = col * 26 + (ref.charCodeAt(q) - 64);
            var t = c.getAttribute('t');
            var v = c.getElementsByTagName('v')[0];
            var val = '';
            if (t === 's' && v) val = compartidas[Number(v.textContent)] || '';
            else if (t === 'inlineStr') val = Array.prototype.slice.call(c.getElementsByTagName('t')).map(function (x) { return x.textContent; }).join('');
            else if (v) val = v.textContent;
            fila[col - 1] = val;
          });
          filas.push(fila);
        });
        return filas;
      });
    });
  }
  function alImportar(ev) {
    var f = ev.target.files[0];
    var est = $('#importar-estado');
    est.className = '';
    est.textContent = '';
    if (!f) return;
    var ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'));
    var lector = ext === '.xlsx'
      ? f.arrayBuffer().then(leerXlsx)
      : ext === '.csv' ? f.arrayBuffer().then(function (b) { return parsearCSV(decodificarTexto(b)); })
      : Promise.reject(new Error('Use la plantilla en formato .xlsx o .csv. Si tiene un .xls antiguo, guárdelo como .xlsx.'));
    lector.then(function (filas) {
      est.className = 'caja caja-ok';
      est.textContent = importarFilas(filas);
    }).catch(function (e) {
      est.className = 'caja caja-error';
      est.textContent = 'No se pudo leer la plantilla: ' + e.message;
    }).then(function () { ev.target.value = ''; });
  }

  // ---------------------------------------------------------------- Archivos y tamaño del envío
  function archivosActivos() {
    return $$('input[type=file][data-archivo]', form).filter(function (i) { return !i.matches(':disabled') && i.files && i.files[0]; });
  }
  function revisarArchivos() {
    var total = 0;
    var error = null, foco = null;
    archivosActivos().forEach(function (i) {
      var f = i.files[0];
      var ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'));
      if (EXT_PERMITIDAS.indexOf(ext) < 0 && !error) { error = 'El archivo “' + f.name + '” no es de un tipo permitido (' + EXT_PERMITIDAS.join(', ') + ').'; foco = i; }
      total += f.size;
    });
    var texto = new Blob([JSON.stringify(armarPayload())]).size;
    var suma = total + texto + 4096;
    var msg = 'Tamaño aproximado del envío: ' + fmtBytes(suma) + ' de 8 MB permitidos' + (total ? ' (archivos: ' + fmtBytes(total) + ').' : '.');
    if (suma > MAX_BYTES && !error) { error = 'El envío pesa ' + fmtBytes(suma) + ' y Netlify acepta máximo 8 MB. Quite archivos o comprímalos en un .zip más pequeño.'; foco = archivosActivos()[0]; }
    ['#tamano-envio', '#tamano-envio-final'].forEach(function (s) {
      var n = $(s);
      if (n) { n.textContent = error && suma > MAX_BYTES ? error : msg; n.className = suma > MAX_BYTES ? 'caja caja-error' : 'nota'; }
    });
    return { error: error, foco: foco, bytes: suma };
  }

  // ---------------------------------------------------------------- Resumen
  function textoValor(c) {
    if (c.tagName === 'SELECT') return c.value ? c.options[c.selectedIndex].text : '';
    if (c.type === 'date') return fmtFecha(c.value);
    if (c.type === 'number') return c.value === '' ? '' : fmtNum(c.value);
    if (c.dataset.k === 'tasa_nominal') return c.value === '' ? '' : fmtNum(c.value, 4) + ' % nominal anual';
    return c.value.trim();
  }
  function valorGrupo(fs) {
    var cont = $('.opciones', fs);
    if (!cont) return '';
    return $$('input[type=checkbox], input[type=radio]', cont).filter(function (c) { return c.checked; }).map(function (c) {
      var t = c.parentElement.textContent.trim();
      var fila = c.closest('.conteo-fila');
      var num = fila && $('input[type=number]', fila);
      if (num && num.value !== '') t += ' (' + fmtNum(num.value) + ' al mes)';
      return t;
    }).join('; ');
  }
  function recorrer(nodo, dl) {
    Array.prototype.forEach.call(nodo.children, function (h) {
      if (h.hidden || h.tagName === 'TEMPLATE' || h.matches('details.ayuda, .no-resumen, .opciones, .hp, .caja, script')) return;
      if (h.matches('.rep-item')) {
        dl.appendChild(el('div', { class: 'sub', text: $('.rep-item-cab h4', h).textContent }));
        recorrer(h, dl);
      } else if (h.matches('label.campo')) {
        var c = $('input, select, textarea', h);
        if (!c || c.matches(':disabled')) return;
        var v = c.type === 'file' ? (c.files && c.files[0] ? c.files[0].name + ' (' + fmtBytes(c.files[0].size) + ')' : '') : textoValor(c);
        if (v) { dl.appendChild(el('dt', { text: textoEtiqueta($('.etq', h)) })); dl.appendChild(el('dd', { text: v })); }
      } else if (h.matches('fieldset.grupo')) {
        var vg = valorGrupo(h);
        if (vg) { dl.appendChild(el('dt', { text: textoEtiqueta($('legend', h)) })); dl.appendChild(el('dd', { text: vg })); }
        recorrer(h, dl);
      } else if (h.matches('.rep-item-cab, button')) {
        return;
      } else recorrer(h, dl);
    });
  }
  function construirResumen() {
    var cont = $('#resumen');
    cont.innerHTML = '';
    pasos.slice(1, ULTIMO).forEach(function (sec, i) {
      var n = i + 1;
      var dl = el('dl');
      recorrer(sec, dl);
      if (!dl.children.length) dl.appendChild(el('dd', { class: 'rep-vacio', text: 'Sin respuestas en esta sección.' }));
      var editar = el('button', { type: 'button', class: 'btn-texto', 'aria-label': 'Editar ' + sec.dataset.titulo, text: 'Editar' });
      editar.addEventListener('click', function () { irA(n); });
      cont.appendChild(el('section', { class: 'resumen-seccion' }, [
        el('div', { class: 'resumen-seccion-cab' }, [el('h3', { text: n + '. ' + sec.dataset.titulo }), editar]),
        dl
      ]));
    });
    $('#resumen-fecha').textContent = 'Generado el ' + new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' }) +
      ' · Grupo: ' + (valorClave(form, 'contacto.grupo') || '—');
  }

  // ---------------------------------------------------------------- Payload y envío
  var aceptadoEn = '';
  function armarPayload() {
    var datos = leerScope(form, false);
    return Object.assign({
      meta: {
        formulario: NETLIFY_FORM, version_formulario: FORM_VERSION, generado_en: isoLocal(new Date()),
        zona_horaria: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
        archivos: archivosActivos().map(function (a) { return { campo: a.dataset.archivo, nombre: a.files[0].name, bytes: a.files[0].size }; })
      },
      aviso_privacidad: {
        version: AVISO_VERSION, consentimiento: $('#consentimiento').checked, aceptado_en: aceptadoEn,
        negativa_finalidades_secundarias: $('#negativa-secundarias').checked
      }
    }, datos);
  }
  function camposPlanos(p) {
    var g = function (path) { var v = getPath(p, path); return v == null ? '' : String(v); };
    var len = function (path) { var v = getPath(p, path); return Array.isArray(v) ? String(v.length) : '0'; };
    return {
      'form-name': NETLIFY_FORM,
      'bot-field': $('#bot-field').value,
      subject: 'Nuevo diagnóstico de tesorería: ' + (g('contacto.grupo') || 'sin nombre'),
      grupo: g('contacto.grupo'), giro: g('contacto.giro') === 'otro' ? g('contacto.giro_otro') : g('contacto.giro'),
      ciudad: g('contacto.ciudad'), contacto_nombre: g('contacto.nombre'), contacto_puesto: g('contacto.puesto'),
      contacto_correo: g('contacto.correo'), contacto_telefono: g('contacto.telefono'),
      num_empresas: g('empresas.numero'), num_cuentas: g('cuentas.numero_total'), num_bancos: g('cuentas.numero_bancos'),
      tiene_h2h: g('h2h.tiene'),
      num_creditos: getPath(p, 'creditos.tiene') === 'si' ? len('creditos.lista') : '0',
      num_coberturas_tasa: getPath(p, 'cob_tasa.tiene') === 'si' ? len('cob_tasa.lista') : '0',
      num_coberturas_fx: getPath(p, 'cob_fx.tiene') === 'si' ? len('cob_fx.lista') : '0',
      alojamiento_preferido: g('infra.alojamiento'),
      consentimiento_aviso: p.aviso_privacidad.consentimiento ? 'si' : 'no',
      aviso_version: AVISO_VERSION, aviso_aceptado_en: aceptadoEn,
      negativa_finalidades_secundarias: p.aviso_privacidad.negativa_finalidades_secundarias ? 'si' : 'no',
      version_formulario: FORM_VERSION,
      payload_json: JSON.stringify(p)
    };
  }
  function enviar(ev) {
    ev.preventDefault();
    if (pasoActual !== ULTIMO) return;
    if (!validarPaso(ULTIMO)) return;
    var btn = $('#btn-enviar');
    var est = $('#envio-estado');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    est.className = 'caja caja-info';
    est.textContent = 'Enviando su diagnóstico; no cierre esta página.';
    var p = armarPayload();
    var campos = camposPlanos(p);
    var archivos = archivosActivos();
    var opciones;
    if (archivos.length) {
      var fd = new FormData();
      Object.keys(campos).forEach(function (k) { fd.append(k, campos[k]); });
      archivos.forEach(function (a) { fd.append(a.dataset.archivo, a.files[0]); });
      opciones = { method: 'POST', body: fd };   // Sin Content-Type: el navegador fija el multipart
    } else {
      opciones = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(campos).toString() };
    }
    fetch('/', opciones).then(function (r) {
      if (!r.ok) throw new Error('El servidor respondió ' + r.status);
      enviado = true;
      clearTimeout(tGuardar);
      almacen.borrar();
      window.location.href = '/gracias.html';
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = 'Enviar diagnóstico';
      est.className = 'caja caja-error';
      est.textContent = 'No se pudo enviar (' + e.message + '). Sus respuestas siguen guardadas en este navegador. Intente de nuevo en unos minutos o descargue sus respuestas en JSON y compártalas por otro medio.';
    });
  }
  function descargarJSON() {
    var p = armarPayload();
    var blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    var nombre = 'diagnostico-tesoreria-' + (norm(getPath(p, 'contacto.grupo') || 'respuestas').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'respuestas') + '.json';
    var a = el('a', { href: URL.createObjectURL(blob), download: nombre });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------------------------------------------------------------- Eventos
  function alCambiar(ev) {
    var t = ev.target;
    if (t.id === 'importar-cuentas' || t.closest('.hp')) return;
    if (t.getAttribute('aria-invalid')) t.removeAttribute('aria-invalid');
    var opc = t.closest('.opciones[aria-invalid]');
    if (opc) opc.removeAttribute('aria-invalid');
    if (t.dataset.k === 'rfc') t.value = t.value.toUpperCase();
    var item = t.closest('[data-repeat="creditos.lista"] .rep-item');
    if (item) calcularTasa(item);
    if (t.id === 'empresas-numero') sincronizarEmpresas();
    if (t.dataset.k === 'cuentas.numero_total' || t.dataset.k === 'cantidad') actualizarConteoCuentas();
    if (t.id === 'consentimiento') aceptadoEn = t.checked ? isoLocal(new Date()) : '';
    if (t.type === 'file') revisarArchivos();
    evaluarCondiciones();
    if (t.id !== 'consentimiento' && t.id !== 'negativa-secundarias') guardarBorrador();
  }

  form.addEventListener('input', alCambiar);
  form.addEventListener('change', alCambiar);
  form.addEventListener('submit', enviar);
  form.addEventListener('click', function (ev) {
    var add = ev.target.closest('[data-add]');
    if (add) {
      var cont = add.closest('[data-repeat]');
      var it = agregarItem(cont);
      evaluarCondiciones();
      if (cont.dataset.repeat === 'cuentas.lista') actualizarConteoCuentas();
      if (cont.dataset.repeat === 'empresas.lista') sincronizarEmpresas();
      var primero = $('input, select', it.querySelector('.campos') || it);
      if (primero) primero.focus();
      guardarBorrador();
      return;
    }
    var q = ev.target.closest('[data-quitar]');
    if (q) {
      var item = q.closest('.rep-item');
      var c = item.closest('[data-repeat]');
      var nombre = $('.rep-item-cab h4', item).textContent;
      if (!window.confirm('¿Quitar ' + nombre + '? Se perderán sus datos.')) return;
      item.remove();
      renumerar(c);
      refrescarDinamicos();
      evaluarCondiciones();
      if (c.dataset.repeat === 'empresas.lista') sincronizarEmpresas();
      if (c.dataset.repeat === 'cuentas.lista') actualizarConteoCuentas();
      var boton = $('[data-add]', c);
      if (boton) boton.focus();
      guardarBorrador();
    }
  });
  // Evita que Enter en un campo de texto envíe el formulario antes del último paso.
  form.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && ev.target.type !== 'checkbox' && ev.target.type !== 'radio') {
      ev.preventDefault();
      if (pasoActual < ULTIMO) $('#btn-siguiente').click();
    }
  });
  $('#btn-siguiente').addEventListener('click', function () { if (validarPaso(pasoActual)) irA(pasoActual + 1); });
  $('#btn-anterior').addEventListener('click', function () { irA(pasoActual - 1); });
  $('#importar-cuentas').addEventListener('change', alImportar);
  $('#btn-json').addEventListener('click', descargarJSON);
  $('#btn-imprimir').addEventListener('click', function () { construirResumen(); window.print(); });
  $('#btn-cerrar-banner').addEventListener('click', function () { $('#banner-borrador').hidden = true; });
  $('#btn-borrar-borrador').addEventListener('click', function () {
    if (!window.confirm('¿Borrar todo lo capturado en este navegador y empezar de nuevo?')) return;
    almacen.borrar();
    window.location.reload();
  });
  $$('.aviso-version').forEach(function (n) { n.textContent = AVISO_VERSION; });

  // ---------------------------------------------------------------- Inicio
  construirOpciones(form);
  $$('[data-repeat]').forEach(renumerar);
  restaurarBorrador();
  irA(pasoActual, false);
})();
