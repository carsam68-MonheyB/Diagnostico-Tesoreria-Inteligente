/* =========================================================================
   Diagnóstico de complejidad — página interna
   Lee en el navegador el CSV exportado de Netlify o el JSON del cliente,
   calcula conteos y aplica la matriz de config/complejidad.json.
   No envía datos a ningún servidor.
   ========================================================================= */
(function () {
  'use strict';

  var OPC = window.DT_OPC || {};
  var estado = { config: null, respuestas: [] };

  // ---------------------------------------------------------------- Utilidades
  function $(s, c) { return (c || document).querySelector(s); }
  function el(tag, attrs, hijos) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (hijos || []).forEach(function (h) { if (h != null) e.appendChild(typeof h === 'string' || typeof h === 'number' ? document.createTextNode(String(h)) : h); });
    return e;
  }
  function g(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v) { return v == null || v === '' || isNaN(Number(v)) ? null : Number(v); }
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function unicos(lista) {
    var vistos = {}, res = [];
    lista.forEach(function (x) { var k = norm(x); if (k && !vistos[k]) { vistos[k] = 1; res.push(String(x).trim()); } });
    return res;
  }
  function separar(texto) { return String(texto || '').split(/[,;\n\/]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function fmt(n, dec) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('es-MX', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec == null ? 2 : dec });
  }
  function etiqueta(cat, valor) {
    var o = arr(OPC[cat]).filter(function (x) { return x[0] === valor; })[0];
    return o ? o[1] : (valor == null || valor === '' ? '—' : String(valor));
  }
  function etiquetas(cat, valores) { return arr(valores).map(function (v) { return etiqueta(cat, v); }).join('; ') || '—'; }
  function siNo(b) { return b == null ? 'sin dato' : (b ? 'Sí' : 'No'); }
  function mensaje(tipo, texto) {
    var e = $('#estado');
    e.className = 'caja caja-' + tipo;
    e.textContent = texto;
  }
  function decodificarEntidades(s) {
    return new DOMParser().parseFromString('<!doctype html><body>' + s, 'text/html').body.textContent;
  }
  function limpiarCadenas(o) {
    if (typeof o === 'string') return /&(lt|gt|amp|quot|#39|#x27);/.test(o) ? decodificarEntidades(o) : o;
    if (Array.isArray(o)) return o.map(limpiarCadenas);
    if (o && typeof o === 'object') { Object.keys(o).forEach(function (k) { o[k] = limpiarCadenas(o[k]); }); }
    return o;
  }

  // ---------------------------------------------------------------- Lectura de archivos
  function parsearCSV(texto) {
    texto = texto.replace(/^﻿/, '');
    var filas = [], fila = [], campo = '', comillas = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (comillas) {
        if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
        else campo += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === ',') { fila.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        fila.push(campo); filas.push(fila); fila = []; campo = '';
      } else campo += ch;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.filter(function (f) { return f.some(function (c) { return c !== ''; }); });
  }
  function parsearPayload(texto) {
    if (texto && typeof texto === 'object') return limpiarCadenas(texto);
    try { return limpiarCadenas(JSON.parse(texto)); }
    catch (e) { return limpiarCadenas(JSON.parse(decodificarEntidades(texto))); }
  }
  function normalizarJSON(obj, fecha) {
    if (Array.isArray(obj)) return obj.reduce(function (acc, x) { return acc.concat(normalizarJSON(x)); }, []);
    if (!obj || typeof obj !== 'object') return [];
    if (obj.payload_json) return [{ p: parsearPayload(obj.payload_json), fecha: obj.created_at || fecha || '' }];
    if (obj.data && obj.data.payload_json) return [{ p: parsearPayload(obj.data.payload_json), fecha: obj.created_at || '' }];
    if (obj.meta && obj.contacto) return [{ p: limpiarCadenas(obj), fecha: g(obj, 'meta.generado_en') || '' }];
    return [];
  }
  function leerRespuestas(nombre, texto) {
    if (/\.json$/i.test(nombre)) return normalizarJSON(JSON.parse(texto.replace(/^﻿/, '')));
    var filas = parsearCSV(texto);
    if (filas.length < 2) throw new Error('El CSV no tiene filas de respuestas.');
    var cab = filas[0].map(norm);
    var iP = cab.indexOf('payload_json');
    if (iP < 0) throw new Error('El CSV no tiene la columna payload_json. ¿Es la exportación del formulario diagnostico-tesoreria?');
    var iF = cab.findIndex(function (c) { return c === 'created_at' || c.indexOf('fecha') >= 0 || c.indexOf('created') >= 0; });
    return filas.slice(1).map(function (f) {
      try { return { p: parsearPayload(f[iP]), fecha: iF >= 0 ? f[iF] : '' }; }
      catch (e) { return null; }
    }).filter(Boolean);
  }

  // ---------------------------------------------------------------- Métricas
  function bancosUnicos(p) { return unicos(arr(g(p, 'cuentas.lista')).map(function (c) { return c.banco; })); }
  function creditos(p) { return g(p, 'creditos.tiene') === 'si' ? arr(g(p, 'creditos.lista')) : []; }
  function sumar(lista) {
    var vals = lista.map(num).filter(function (x) { return x != null; });
    return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) : null;
  }
  function erps(p) {
    var l = arr(g(p, 'empresas.lista')).map(function (e) { return e.erp === 'otro' ? e.erp_otro : etiqueta('erps', e.erp); });
    arr(g(p, 'sistemas.erp')).forEach(function (v) { l.push(v === 'otro' ? g(p, 'sistemas.erp_otro') : etiqueta('erps', v)); });
    return unicos(l.filter(function (x) { return x && x !== '—'; }));
  }
  function monedas(p) {
    var l = arr(g(p, 'monedas.lista')).filter(function (m) { return m !== 'otra'; });
    if (arr(g(p, 'monedas.lista')).indexOf('otra') >= 0) l = l.concat(separar(g(p, 'monedas.otras')).map(function (x) { return x.toUpperCase(); }));
    return unicos(l);
  }
  function bancosH2h(p) {
    if (g(p, 'h2h.tiene') !== 'si') return [];
    return unicos(arr(g(p, 'h2h.bancos')).concat(separar(g(p, 'h2h.bancos_otros'))));
  }

  var METRICAS = {
    num_bancos: { nombre: 'Número de bancos', f: function (p) { return num(g(p, 'cuentas.numero_bancos')) != null ? num(g(p, 'cuentas.numero_bancos')) : bancosUnicos(p).length; } },
    num_cuentas: { nombre: 'Número de cuentas', f: function (p) { return num(g(p, 'cuentas.numero_total')) != null ? num(g(p, 'cuentas.numero_total')) : sumar(arr(g(p, 'cuentas.lista')).map(function (c) { return c.cantidad == null ? 1 : c.cantidad; })); } },
    num_formatos: { nombre: 'Formatos de estado de cuenta distintos', f: function (p) { return arr(g(p, 'cuentas.formatos')).length; } },
    num_bancos_h2h: { nombre: 'Bancos con H2H', f: function (p) { return bancosH2h(p).length; } },
    num_canales: { nombre: 'Canales de información distintos', f: function (p) { return arr(g(p, 'cuentas.canales')).length; } },
    layouts_no_documentados: { nombre: 'Tiene H2H sin layouts documentados', bool: true, f: function (p) { return g(p, 'h2h.tiene') === 'si' ? g(p, 'h2h.layouts_documentados') === 'no' : false; } },
    movimientos_mes: { nombre: 'Movimientos bancarios al mes (suma de cuentas capturadas)', f: function (p) { return sumar(arr(g(p, 'cuentas.lista')).map(function (c) { return c.movimientos_mes; })); } },
    pagos_mes: { nombre: 'Pagos a terceros al mes (suma por tipo)', f: function (p) {
      var vol = g(p, 'pagos.volumen') || {};
      return sumar(arr(g(p, 'pagos.tipos')).map(function (t) { return vol[t]; }));
    } },
    usa_dispersion_masiva: { nombre: 'Usa dispersión masiva por layout', bool: true, f: function (p) { var v = g(p, 'pagos.dispersion_masiva'); return v == null ? null : (v === 'si' || v === 'parcial'); } },
    num_creditos: { nombre: 'Número de créditos', f: function (p) { return creditos(p).length; } },
    num_tasas_base: { nombre: 'Tasas base distintas', f: function (p) { return unicos(creditos(p).map(function (c) { return c.tasa_base; })).length; } },
    creditos_sin_tabla: { nombre: 'Créditos sin tabla de amortización propia', f: function (p) { return creditos(p).filter(function (c) { return c.tabla_amortizacion !== 'si'; }).length; } },
    num_coberturas_tasa: { nombre: 'Coberturas de tasa', f: function (p) { return g(p, 'cob_tasa.tiene') === 'si' ? arr(g(p, 'cob_tasa.lista')).length : 0; } },
    num_coberturas_fx: { nombre: 'Coberturas cambiarias', f: function (p) { return g(p, 'cob_fx.tiene') === 'si' ? arr(g(p, 'cob_fx.lista')).length : 0; } },
    num_monedas: { nombre: 'Monedas', f: function (p) { return monedas(p).length; } },
    num_empresas: { nombre: 'Empresas', f: function (p) { return num(g(p, 'empresas.numero')) != null ? num(g(p, 'empresas.numero')) : arr(g(p, 'empresas.lista')).length; } },
    num_conceptos_ic: { nombre: 'Conceptos intercompañía', f: function (p) { return g(p, 'ic.tiene') === 'si' ? arr(g(p, 'ic.conceptos')).length : 0; } },
    ic_no_identificadas: { nombre: 'Intercompañías que no se identifican en el estado de cuenta', bool: true, f: function (p) { return g(p, 'ic.tiene') === 'si' ? arr(g(p, 'ic.identificacion')).indexOf('no_se_identifican') >= 0 : false; } },
    ic_con_intereses: { nombre: 'Intercompañías con intereses', bool: true, f: function (p) { return g(p, 'ic.tiene') === 'si' ? g(p, 'ic.intereses') === 'si' : false; } },
    num_erps: { nombre: 'ERP o sistemas contables distintos', f: function (p) { return erps(p).length; } },
    conciliacion_manual_o_excel: { nombre: 'Concilia en Excel o manualmente', bool: true, f: function (p) { var c = arr(g(p, 'sistemas.conciliacion')); return c.length ? (c.indexOf('manual') >= 0 || c.indexOf('excel') >= 0) : null; } },
    erp_sin_modulo_tesoreria: { nombre: 'ERP sin módulo de tesorería', bool: true, f: function (p) { var v = g(p, 'sistemas.modulo_tesoreria'); return v == null || v === 'no_se' ? null : v === 'no'; } },
    restriccion_salida_datos: { nombre: 'La información no puede salir de la red de la empresa', bool: true, f: function (p) { var v = g(p, 'infra.permite_salida'); return v == null || v === 'no_se' ? null : v === 'no'; } },
    actualizacion_intradia: { nombre: 'Quiere actualización intradía', bool: true, f: function (p) { var v = g(p, 'infra.frecuencia'); return v == null ? null : v === 'intradia'; } },
    num_usuarios: { nombre: 'Usuarios del tablero', f: function (p) { return num(g(p, 'infra.usuarios')); } },
    num_indicadores: { nombre: 'Indicadores solicitados', f: function (p) { return arr(g(p, 'infra.indicadores')).length; } }
  };

  var SENALES = {
    tiene_licencias_powerbi: { nombre: 'Tiene licencias de Power BI (Pro, PPU o Fabric)', f: function (p) { return ['pro', 'ppu', 'fabric'].indexOf(g(p, 'sistemas.powerbi')) >= 0; } },
    tiene_gateway: { nombre: 'Tiene gateway de Power BI instalado', f: function (p) { return g(p, 'sistemas.gateway') === 'si'; } },
    usa_m365: { nombre: 'Usa Microsoft 365', f: function (p) { return g(p, 'sistemas.m365') === 'si'; } },
    actualizacion_intradia: { nombre: 'Quiere actualización intradía', f: function (p) { return g(p, 'infra.frecuencia') === 'intradia'; } },
    usuarios_mayor_a: { nombre: 'Usuarios del tablero mayores a {valor}', f: function (p, s) { return s.valor != null && num(g(p, 'infra.usuarios')) != null && num(g(p, 'infra.usuarios')) > s.valor; } },
    prefiere_servidor_propio: { nombre: 'Prefiere servidor propio', f: function (p) { return g(p, 'infra.alojamiento') === 'servidor_propio'; } },
    prefiere_nube: { nombre: 'Prefiere nube', f: function (p) { return g(p, 'infra.alojamiento') === 'nube'; } },
    restriccion_salida_datos: { nombre: 'La información no puede salir de la red de la empresa', f: function (p) { return g(p, 'infra.permite_salida') === 'no'; } },
    nube_identificada: { nombre: 'Ya usa o identifica una nube (Azure, AWS, Google Cloud)', f: function (p) { return arr(g(p, 'infra.nubes')).length > 0; } }
  };

  // ---------------------------------------------------------------- Configuración
  function esNum(v) { return typeof v === 'number' && !isNaN(v); }
  function revisarConfig(cfg) {
    var faltan = [];
    var niveles = arr(g(cfg, 'escala.niveles'));
    var L = niveles.length;
    if (L < 2) faltan.push('escala.niveles (al menos 2 niveles)');
    if (['promedio', 'maximo'].indexOf(cfg.agregacion_metricas) < 0) faltan.push('agregacion_metricas ("promedio" o "maximo")');
    arr(cfg.dimensiones).forEach(function (d, i) {
      var base = 'dimensiones[' + i + '] ' + (d.nombre || d.id);
      if (!esNum(d.peso)) faltan.push(base + ' → peso');
      arr(d.metricas).forEach(function (m) {
        var def = METRICAS[m.id];
        if (!def) { faltan.push(base + ' → métrica desconocida "' + m.id + '"'); return; }
        if (def.bool) {
          if (!esNum(m.nivel_si) || !esNum(m.nivel_no)) faltan.push(base + ' → ' + m.id + ' (nivel_si / nivel_no)');
        } else if (arr(m.umbrales).length !== L - 1 || !arr(m.umbrales).every(esNum)) {
          faltan.push(base + ' → ' + m.id + ' (umbrales: ' + (L - 1) + ' números ascendentes)');
        }
      });
    });
    var ct = arr(g(cfg, 'clasificacion_total.umbrales'));
    if (ct.length !== L - 1 || !ct.every(esNum)) faltan.push('clasificacion_total.umbrales');
    ['recomendacion_herramienta', 'recomendacion_alojamiento'].forEach(function (r) { faltan = faltan.concat(revisarRec(cfg[r], r)); });
    return faltan;
  }
  function revisarRec(rc, nombre) {
    var f = [];
    if (!rc) return [nombre + ' (no existe)'];
    var ops = Object.keys(rc.opciones || {});
    var pp = rc.por_puntaje || {};
    if (!esNum(pp.peso)) f.push(nombre + '.por_puntaje.peso');
    else if (pp.peso !== 0) {
      if (!esNum(pp.corte)) f.push(nombre + '.por_puntaje.corte');
      if (ops.indexOf(pp.por_encima_favorece) < 0) f.push(nombre + '.por_puntaje.por_encima_favorece');
      if (ops.indexOf(pp.por_debajo_favorece) < 0) f.push(nombre + '.por_puntaje.por_debajo_favorece');
    }
    arr(rc.senales).forEach(function (s) {
      if (!SENALES[s.id]) { f.push(nombre + ' → señal desconocida "' + s.id + '"'); return; }
      if (!esNum(s.peso)) f.push(nombre + ' → ' + s.id + '.peso');
      else if (s.peso !== 0 && ops.indexOf(s.favorece) < 0) f.push(nombre + ' → ' + s.id + '.favorece');
      if (s.id === 'usuarios_mayor_a' && s.peso !== 0 && !esNum(s.valor)) f.push(nombre + ' → usuarios_mayor_a.valor');
    });
    if (typeof rc.empate !== 'string' || !rc.empate) f.push(nombre + '.empate (texto)');
    return f;
  }
  function nivelNumerico(valor, umbrales) {
    if (valor == null || !umbrales.length || !umbrales.every(esNum)) return null;
    return 1 + umbrales.filter(function (t) { return valor > t; }).length;
  }
  function nivelMetrica(m, valor, L) {
    var def = METRICAS[m.id];
    if (!def || valor == null) return null;
    if (def.bool) return esNum(m.nivel_si) && esNum(m.nivel_no) ? (valor ? m.nivel_si : m.nivel_no) : null;
    return arr(m.umbrales).length === L - 1 ? nivelNumerico(valor, m.umbrales) : null;
  }

  // ---------------------------------------------------------------- Cálculo
  function calcular(p, cfg) {
    var niveles = arr(g(cfg, 'escala.niveles'));
    var L = niveles.length;
    var agreg = cfg.agregacion_metricas;
    var dims = arr(cfg.dimensiones).map(function (d) {
      var ms = arr(d.metricas).map(function (m) {
        var def = METRICAS[m.id];
        var valor = def ? def.f(p) : null;
        return { id: m.id, nombre: def ? def.nombre : m.id, bool: def && def.bool, valor: valor, nivel: nivelMetrica(m, valor, L) };
      });
      var conNivel = ms.filter(function (m) { return m.nivel != null; }).map(function (m) { return m.nivel; });
      var completo = ms.every(function (m) { return m.nivel != null || m.valor == null; });
      var puntaje = null;
      if (conNivel.length && completo && (agreg === 'promedio' || agreg === 'maximo')) {
        puntaje = agreg === 'maximo' ? Math.max.apply(null, conNivel) : conNivel.reduce(function (a, b) { return a + b; }, 0) / conNivel.length;
      }
      return { id: d.id, nombre: d.nombre, peso: d.peso, metricas: ms, puntaje: puntaje, sinDato: ms.filter(function (m) { return m.valor == null; }).length };
    });
    var total = null;
    if (dims.length && dims.every(function (d) { return esNum(d.peso); })) {
      var usadas = dims.filter(function (d) { return d.puntaje != null && d.peso > 0; });
      var faltaPuntaje = dims.some(function (d) { return d.peso > 0 && d.puntaje == null && d.sinDato < d.metricas.length; });
      var sp = usadas.reduce(function (a, d) { return a + d.peso; }, 0);
      if (!faltaPuntaje && sp > 0) total = usadas.reduce(function (a, d) { return a + d.peso * d.puntaje; }, 0) / sp;
    }
    var nivelTotal = total == null ? null : nivelNumerico(total, arr(g(cfg, 'clasificacion_total.umbrales')));
    return { niveles: niveles, dims: dims, total: total, nivelTotal: nivelTotal };
  }
  function recomendar(p, rc, total) {
    var ops = rc.opciones || {};
    var suma = {};
    Object.keys(ops).forEach(function (k) { suma[k] = 0; });
    var filas = [];
    var pp = rc.por_puntaje || {};
    if (esNum(pp.peso) && pp.peso !== 0 && total != null) {
      var fav = total > pp.corte ? pp.por_encima_favorece : pp.por_debajo_favorece;
      if (fav in suma) suma[fav] += pp.peso;
      filas.push({ nombre: 'Puntaje total ' + fmt(total, 2) + (total > pp.corte ? ' mayor que ' : ' menor o igual a ') + 'el corte ' + fmt(pp.corte, 2), activa: true, favorece: ops[fav] || '—', peso: pp.peso });
    }
    arr(rc.senales).forEach(function (s) {
      var def = SENALES[s.id];
      if (!def) return;
      var activa = !!def.f(p, s);
      if (activa && esNum(s.peso) && s.favorece in suma) suma[s.favorece] += s.peso;
      filas.push({ nombre: def.nombre.replace('{valor}', s.valor == null ? '[[PENDIENTE]]' : s.valor), activa: activa, favorece: ops[s.favorece] || '[[PENDIENTE]]', peso: esNum(s.peso) ? s.peso : null });
    });
    var claves = Object.keys(suma);
    var max = Math.max.apply(null, claves.map(function (k) { return suma[k]; }));
    var ganadores = claves.filter(function (k) { return suma[k] === max; });
    return { filas: filas, suma: suma, resultado: ganadores.length === 1 ? ops[ganadores[0]] : rc.empate };
  }

  // ---------------------------------------------------------------- Render
  function tabla(cabeceras, filas, numericas) {
    numericas = numericas || [];
    var thead = el('thead', {}, [el('tr', {}, cabeceras.map(function (c, i) { return el('th', { scope: 'col', class: numericas.indexOf(i) >= 0 ? 'num' : '' , text: c }); }))]);
    var tbody = el('tbody', {}, filas.map(function (f) {
      return el('tr', { class: f._clase || '' }, f.map(function (c, i) {
        return el('td', { class: numericas.indexOf(i) >= 0 ? 'num' : '' }, [c instanceof Node ? c : String(c == null ? '—' : c)]);
      }));
    }));
    return el('div', { class: 'tabla-wrap' }, [el('table', {}, [thead, tbody])]);
  }
  function nivelTxt(niveles, n) {
    if (n == null) return el('span', { class: 'etiqueta-nivel', text: 'pendiente' });
    var redondo = Math.min(niveles.length, Math.max(1, Math.round(n)));
    var txt = (Number.isInteger(n) ? '' : fmt(n, 2) + ' · ') + (niveles[redondo - 1] || n);
    return el('span', { class: 'etiqueta-nivel', text: txt });
  }
  function seccion(titulo, hijos) { return el('section', { class: 'tarjeta' }, [el('h2', { text: titulo })].concat(hijos)); }

  function render(r) {
    var p = r.p;
    var cfg = estado.config;
    var out = $('#resultado');
    out.innerHTML = '';
    var bloques = [];

    // Encabezado
    bloques.push(seccion(g(p, 'contacto.grupo') || 'Respuesta sin nombre', [
      el('p', {}, ['Contacto: ' + (g(p, 'contacto.nombre') || '—') + ' · ' + (g(p, 'contacto.puesto') || '—') + ' · ' + (g(p, 'contacto.correo') || '—') + ' · ' + (g(p, 'contacto.telefono') || '—')]),
      el('p', { class: 'nota' }, ['Giro: ' + (g(p, 'contacto.giro') === 'otro' ? g(p, 'contacto.giro_otro') : etiqueta('giros', g(p, 'contacto.giro'))) +
        ' · Ciudad: ' + (g(p, 'contacto.ciudad') || '—') + ' · Enviado: ' + (r.fecha || g(p, 'meta.generado_en') || '—') +
        ' · Aviso v' + (g(p, 'aviso_privacidad.version') || '—') + ' aceptado: ' + (g(p, 'aviso_privacidad.aceptado_en') || '—') +
        ' · Negativa finalidades secundarias: ' + siNo(g(p, 'aviso_privacidad.negativa_finalidades_secundarias'))])
    ]));

    // Conteos
    var cob = METRICAS.num_coberturas_tasa.f(p) + METRICAS.num_coberturas_fx.f(p);
    var kpis = [
      ['Empresas', METRICAS.num_empresas.f(p)], ['Bancos', METRICAS.num_bancos.f(p)], ['Cuentas', METRICAS.num_cuentas.f(p)],
      ['Monedas', METRICAS.num_monedas.f(p)], ['Créditos', METRICAS.num_creditos.f(p)], ['Coberturas (tasa + cambiarias)', cob],
      ['Formatos de archivo distintos', METRICAS.num_formatos.f(p)], ['Bancos con H2H', METRICAS.num_bancos_h2h.f(p)]
    ];
    bloques.push(seccion('Conteos', [el('div', { class: 'kpis' }, kpis.map(function (k) {
      return el('div', { class: 'kpi' }, [el('div', { class: 'kpi-valor', text: fmt(k[1], 0) }), el('div', { class: 'kpi-etq', text: k[0] })]);
    }))]));

    // Matriz
    var faltan = cfg ? revisarConfig(cfg) : ['No se cargó config/complejidad.json'];
    var hijosMatriz = [];
    if (faltan.length) {
      hijosMatriz.push(el('div', { class: 'caja caja-aviso' }, [
        el('p', {}, [el('strong', { text: 'Configuración incompleta: ' }), 'se muestran los valores, pero los niveles y la recomendación quedan pendientes hasta definir en config/complejidad.json:']),
        el('ul', {}, faltan.slice(0, 60).map(function (f) { return el('li', { text: f }); }))
      ]));
    }
    if (cfg) {
      var c = calcular(p, cfg);
      var filas = [];
      c.dims.forEach(function (d) {
        var fd = [el('strong', { text: d.nombre }), 'Peso: ' + (esNum(d.peso) ? d.peso : 'pendiente'), '', nivelTxt(c.niveles, d.puntaje)];
        fd._clase = 'fila-dimension';
        filas.push(fd);
        d.metricas.forEach(function (m) {
          filas.push(['', m.nombre, m.valor == null ? 'sin dato' : (m.bool ? siNo(m.valor) : fmt(m.valor, 0)), m.valor == null ? 'sin dato' : nivelTxt(c.niveles, m.nivel)]);
        });
      });
      hijosMatriz.push(tabla(['Dimensión', 'Métrica', 'Valor', 'Nivel'], filas, [2]));
      hijosMatriz.push(el('p', {}, [el('strong', { text: 'Puntaje total: ' }), c.total == null ? 'pendiente' : fmt(c.total, 2), ' · Nivel global: ', nivelTxt(c.niveles, c.nivelTotal)]));
      var sinDato = c.dims.reduce(function (a, d) { return a + d.sinDato; }, 0);
      if (sinDato) hijosMatriz.push(el('p', { class: 'nota', text: sinDato + ' métricas sin dato capturado por el cliente; no se consideran en el promedio de su dimensión.' }));
      bloques.push(seccion('Matriz de complejidad', hijosMatriz));

      // Recomendaciones
      var hijosRec = [];
      ['recomendacion_herramienta', 'recomendacion_alojamiento'].forEach(function (k) {
        var rc = cfg[k];
        if (!rc) return;
        var pend = revisarRec(rc, k);
        var res = recomendar(p, rc, c.total);
        hijosRec.push(el('h3', { text: rc.titulo || k }));
        hijosRec.push(tabla(['Señal', '¿Aplica?', 'Favorece', 'Peso'], res.filas.map(function (f) { return [f.nombre, f.activa ? 'Sí' : 'No', f.favorece, f.peso == null ? 'pendiente' : f.peso]; }), [3]));
        if (pend.length || c.total == null && esNum(g(rc, 'por_puntaje.peso')) && rc.por_puntaje.peso !== 0) {
          hijosRec.push(el('p', {}, [el('strong', { text: 'Recomendación preliminar: ' }), 'pendiente de configurar.']));
        } else {
          hijosRec.push(el('p', {}, [el('strong', { text: 'Recomendación preliminar: ' }), res.resultado + ' (' + Object.keys(res.suma).map(function (o) { return rc.opciones[o] + ': ' + fmt(res.suma[o], 2); }).join(' · ') + ')']));
        }
      });
      hijosRec.push(el('p', { class: 'nota', text: 'La recomendación es preliminar y depende de los pesos definidos en config/complejidad.json. Revise siempre las restricciones de TI en texto libre.' }));
      bloques.push(seccion('Recomendación preliminar', hijosRec));
    } else {
      bloques.push(seccion('Matriz de complejidad', hijosMatriz));
    }

    // Créditos (solo condiciones: el formulario no pide saldos ni montos)
    var cr = creditos(p);
    if (cr.length) {
      var porMoneda = {};
      cr.forEach(function (x) {
        var m = x.moneda === 'otra' ? (x.moneda_otra || 'Otra') : (x.moneda || '—');
        porMoneda[m] = porMoneda[m] || { n: 0, tasas: [] };
        porMoneda[m].n++;
        if (num(x.tasa_nominal) != null) porMoneda[m].tasas.push(num(x.tasa_nominal));
      });
      var filasM = Object.keys(porMoneda).map(function (m) {
        var d = porMoneda[m];
        var rango = d.tasas.length ? fmt(Math.min.apply(null, d.tasas), 4) + ' % – ' + fmt(Math.max.apply(null, d.tasas), 4) + ' %' : 'sin dato';
        return [m, d.n, rango, d.tasas.length + ' de ' + d.n];
      });
      var filasC = cr.map(function (x, i) {
        var base = x.tasa_base === 'fija' ? 'Fija ' + fmt(num(x.tasa_fija), 4) + ' %' :
          (x.tasa_base === 'otra' ? (x.tasa_base_otra || 'Otra') : etiqueta('tasas_base', x.tasa_base)) + ' + ' + fmt(num(x.sobretasa_pp), 4) + ' pp';
        return [i + 1, etiqueta('tipos_credito', x.tipo), x.empresa || '—', x.banco || '—', x.moneda === 'otra' ? x.moneda_otra : x.moneda, x.vencimiento || '—', base, num(x.tasa_nominal) == null ? 'sin dato' : fmt(num(x.tasa_nominal), 4) + ' %', etiqueta('amortizacion', x.amortizacion), etiqueta('tabla_amort', x.tabla_amortizacion)];
      });
      bloques.push(seccion('Créditos capturados', [
        el('p', { class: 'nota', text: 'Condiciones tal como las capturó el cliente (sin saldos ni montos). Tasas nominales anuales.' }),
        tabla(['Moneda', 'Créditos', 'Rango de tasa nominal anual', 'Con tasa capturada'], filasM, [1]),
        el('h3', { text: 'Detalle de créditos' }),
        tabla(['#', 'Tipo', 'Empresa', 'Banco', 'Moneda', 'Vencimiento', 'Tasa pactada', 'Tasa nominal anual', 'Amortización', 'Tabla de amortización'], filasC, [7])
      ]));
    }

    // Detalle cualitativo
    var det = [
      ['Bancos capturados', bancosUnicos(p).join('; ') || '—'],
      ['Bancos con H2H', bancosH2h(p).join('; ') || (g(p, 'h2h.tiene') ? etiqueta('si_no_nose', g(p, 'h2h.tiene')) : '—')],
      ['Canales', etiquetas('canales', g(p, 'cuentas.canales'))],
      ['Formatos', etiquetas('formatos', g(p, 'cuentas.formatos')) + (g(p, 'cuentas.formatos_otro') ? ' (' + g(p, 'cuentas.formatos_otro') + ')' : '')],
      ['Frecuencia de descarga actual', etiquetas('frecuencia_descarga', g(p, 'cuentas.frecuencia'))],
      ['Monedas', monedas(p).join(', ') || '—'],
      ['Tipo de cambio para valuar', etiquetas('tipo_cambio', g(p, 'monedas.tipo_cambio'))],
      ['Posición natural USD', etiqueta('posicion_natural', g(p, 'cob_fx.posicion_natural'))],
      ['Política de cobertura documentada', etiqueta('si_no', g(p, 'cob_fx.politica'))],
      ['ERP / sistemas', erps(p).join('; ') || '—'],
      ['Conciliación', etiquetas('conciliacion', g(p, 'sistemas.conciliacion'))],
      ['Power BI', etiqueta('powerbi', g(p, 'sistemas.powerbi')) + ' · Gateway: ' + etiqueta('si_no_nose', g(p, 'sistemas.gateway')) + ' · M365: ' + etiqueta('si_no_nose', g(p, 'sistemas.m365'))],
      ['Alojamiento preferido', etiqueta('alojamiento', g(p, 'infra.alojamiento')) + (arr(g(p, 'infra.nubes')).length ? ' (' + etiquetas('nubes', g(p, 'infra.nubes')) + ')' : '')],
      ['¿Puede salir la información?', etiqueta('si_no_nose', g(p, 'infra.permite_salida'))],
      ['Restricciones de TI', g(p, 'infra.restricciones') || '—'],
      ['Frecuencia deseada', etiqueta('frecuencia_tablero', g(p, 'infra.frecuencia'))],
      ['Indicadores', etiquetas('indicadores', g(p, 'infra.indicadores')) + (g(p, 'infra.indicadores_otro') ? ' (' + g(p, 'infra.indicadores_otro') + ')' : '')],
      ['Reportes actuales', g(p, 'sistemas.reportes') || '—'],
      ['Archivos adjuntos', arr(g(p, 'meta.archivos')).map(function (a) { return a.nombre; }).join('; ') || 'ninguno']
    ];
    bloques.push(seccion('Detalle para el diagnóstico', [tabla(['Dato', 'Respuesta'], det)]));

    bloques.push(seccion('Respuesta completa (JSON)', [el('details', {}, [el('summary', { text: 'Ver JSON' }), el('pre', { text: JSON.stringify(p, null, 2) })])]));

    bloques.forEach(function (b) { out.appendChild(b); });
  }

  // ---------------------------------------------------------------- Eventos
  function cargarConfig() {
    return fetch('/config/complejidad.json', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (cfg) { estado.config = cfg; }).catch(function (e) {
      mensaje('aviso', 'No se pudo leer /config/complejidad.json (' + e.message + '). Puede cargarlo manualmente en “Usar otra configuración”.');
    });
  }
  function mostrarSeleccion() {
    var s = $('#seleccion');
    s.innerHTML = '';
    estado.respuestas.forEach(function (r, i) {
      s.appendChild(el('option', { value: String(i), text: (g(r.p, 'contacto.grupo') || 'Sin nombre') + (r.fecha ? ' — ' + r.fecha : '') }));
    });
    $('#campo-seleccion').hidden = estado.respuestas.length < 2;
    if (estado.respuestas.length) render(estado.respuestas[Number(s.value) || 0]);
  }
  $('#archivo-respuestas').addEventListener('change', function (ev) {
    var f = ev.target.files[0];
    if (!f) return;
    f.text().then(function (t) {
      estado.respuestas = leerRespuestas(f.name, t);
      if (!estado.respuestas.length) throw new Error('No se encontraron respuestas del formulario en el archivo.');
      mensaje('ok', 'Se leyeron ' + estado.respuestas.length + ' respuesta(s) de ' + f.name + '.');
      mostrarSeleccion();
    }).catch(function (e) { mensaje('error', 'No se pudo leer el archivo: ' + e.message); });
  });
  $('#seleccion').addEventListener('change', function (ev) { render(estado.respuestas[Number(ev.target.value)]); });
  $('#archivo-config').addEventListener('change', function (ev) {
    var f = ev.target.files[0];
    if (!f) return;
    f.text().then(function (t) {
      estado.config = JSON.parse(t);
      mensaje('ok', 'Configuración cargada desde ' + f.name + ' (solo en esta pestaña).');
      if (estado.respuestas.length) render(estado.respuestas[Number($('#seleccion').value) || 0]);
    }).catch(function (e) { mensaje('error', 'Configuración no válida: ' + e.message); });
  });

  cargarConfig();
  window.DT_DIAG = { METRICAS: METRICAS, SENALES: SENALES, calcular: calcular, revisarConfig: revisarConfig, leerRespuestas: leerRespuestas };
})();
