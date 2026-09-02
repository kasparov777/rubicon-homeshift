/* ============================================================
   CALC.JS — калькулятор цены перевозки РУБИКОН
   Автоподбор адресов: OpenStreetMap Nominatim
   Расчёт км: маршрут OSRM (fallback — прямая × 1.3)
   Режимы: «По городу» = только улицы, контекст Вроцлав
           «За город» = город + улица для точки А и Б
   Формула цены — из prajs.md
   ============================================================ */
(function () {
  'use strict';

  var lang = (document.documentElement.getAttribute('lang') || 'ru').toLowerCase();
  var I = {
    ru: { s: 'малый', m: 'средний', l: 'крупный' },
    pl: { s: 'mały', m: 'średni', l: 'duży' },
    en: { s: 'small', m: 'medium', l: 'large' }
  };
  var NOTES = {
    ru: { s: 'коробки · кресло · ТВ · стиральная машина', m: 'стол · холодильник · тумба · шкафчик', l: 'диван · шкаф · кровать 200 · паллета' },
    pl: { s: 'kartony · fotel · TV · pralka', m: 'stół · lodówka · komoda · szafka', l: 'sofa · szafa · łóżko 200 · paleta' },
    en: { s: 'boxes · armchair · TV · washing machine', m: 'table · fridge · cabinet · sideboard', l: 'sofa · wardrobe · bed 200 · pallet' }
  };
  var MSG = {
    ru: { nores: 'Ничего не нашлось — попробуйте иначе.', route: 'Маршрут', pick: 'укажите откуда и куда', inc: 'включены', km: 'Км', kmf: 'первые 5 включены', kmo: 'Км сверх 30', gab: 'Габарит — ', floor: 'Подъём без лифта', ins: 'Страховка груза', cityOnly: 'Улица в Вроцлаве', from: 'Откуда', to: 'Куда', city: 'Город…', street: 'Улица…' },
    pl: { nores: 'Nic nie znaleziono — spróbuj inaczej.', route: 'Trasa', pick: 'podaj skąd i dokąd', inc: 'w cenie', km: 'km', kmf: 'pierwsze 5 km w cenie', kmo: 'km powyżej 30', gab: 'Wymiar — ', floor: 'Wniesienie bez windy', ins: 'Ubezpieczenie ładunku', cityOnly: 'Ulica we Wrocławiu', from: 'Skąd', to: 'Dokąd', city: 'Miasto…', street: 'Ulica…' },
    en: { nores: 'Nothing found — try typing differently.', route: 'Route', pick: 'enter from and to', inc: 'included', km: 'km', kmf: 'first 5 km included', kmo: 'km over 30', gab: 'Load — ', floor: 'Carrying without lift', ins: 'Cargo insurance', cityOnly: 'Street in Wrocław', from: 'From', to: 'To', city: 'City…', street: 'Street…' }
  };
  var D = MSG[lang] || MSG.ru;
  var gname = I[lang] || I.ru;

  /* --- Тарифы (prajs.md) --- */
  var RATES = { s: { base: 59, note: NOTES[lang][ 's' ] }, m: { base: 99 }, l: { base: 149 } };
  var FLOOR = { s: 30, m: 50, l: 70 };
  var CITY_FREE = 5;
  var PROG = [{ upto: 3, rate: 2.50 }, { upto: 2, rate: 2.75 }, { upto: Infinity, rate: 3.00 }];
  var OUT_FREE = 30, OUT_KM = 3.75, OUT_BASE = { s: 179, m: 249, l: 359 };
  var INSURANCE = { s: 15, m: 25, l: 35 };
  var WROC = { lat: 51.1079, lon: 17.0385 };

  var state = {
    acity: null, astreet: null, bcity: null, bstreet: null,  // выбранные координаты
    g: 'm', floor: 'no', trip: 'city', ins: false, km: null
  };

  var NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  var e = function (id) { return document.getElementById(id); };
  var rowsEl = e('sum-rows'), totalEl = e('sum-total'), floorPriceEl = e('floor-price');
  var cityA = e('citygroup-a'), cityB = e('citygroup-b'), tA = e('addr-a-title'), tB = e('addr-b-title');

  /* ---------- Режим поездки ---------- */
  function setTrip(t) {
    state.trip = t;
    var out = t === 'out';
    if (cityA) cityA.classList.toggle('hidden', !out);
    if (cityB) cityB.classList.toggle('hidden', !out);
    if (tA) tA.textContent = out ? D.from : D.cityOnly;
    if (tB) tB.textContent = out ? D.to : D.cityOnly;
    state.km = null; recalc();
  }

  /* ---------- Геокодинг ---------- */
  function geocode(q, cb) {
    fetch(NOMINATIM + '?q=' + encodeURIComponent(q) + '&countrycodes=pl&format=json&limit=6&accept-language=' + lang)
      .then(function (r) { return r.json(); })
      .then(function (res) { cb((res || []).map(normRes)); })
      .catch(function () { cb([]); });
  }
  function normRes(p) {
    var a = p.address || {};
    var city = a.city || a.town || a.village || a.municipality || '';
    var clean = [a.road, city].filter(Boolean).join(', ') + (a.postcode ? ', ' + a.postcode : '');
    if (!a.road && !city) clean = p.display_name.split(',')[0];
    var sub = [a.postcode, a.state || a.county].filter(Boolean).join(' · ');
    return { lat: parseFloat(p.lat), lon: parseFloat(p.lon), clean: clean, sub: sub };
  }

  /* bindGeocode: slot — куда писать координаты {city|street}, ctxId — id поля города для контекста */
  function bindGeocode(inputId, suggestId, slot, ctxId) {
    var input = e(inputId), box = e(suggestId);
    if (!input || !box) return;
    var timer = null;
    function hide() { box.classList.remove('open'); }
    function show(items) {
      box.innerHTML = '';
      if (!items.length) {
        var nr = document.createElement('div'); nr.className = 'nores'; nr.textContent = D.nores;
        box.appendChild(nr);
      } else {
        items.forEach(function (it) {
          var d = document.createElement('div'); d.className = 'opt';
          d.innerHTML = '<strong></strong><small></small>';
          d.querySelector('strong').textContent = it.clean;
          d.querySelector('small').textContent = it.sub;
          d.addEventListener('mousedown', function (ev) {
            ev.preventDefault();
            state[slot] = { lat: it.lat, lon: it.lon, label: it.clean };
            input.value = it.clean;
            hide();
            resolve();
          });
          box.appendChild(d);
        });
      }
      box.classList.add('open');
    }
    input.addEventListener('input', function () {
      clearTimeout(timer); hide();
      state[slot] = null; resolve();
      var q = input.value.trim();
      if (q.length < 3) return;
      var full = q;
      if (slot.indexOf('street') === 0 && ctxId) {
        var c = e(ctxId); if (c && c.value.trim()) full = q + ', ' + c.value.trim();
      }
      timer = setTimeout(function () { geocode(full, show); }, 320);
    });
    document.addEventListener('click', function (e2) { if (!input.contains(e2.target)) hide(); });
  }

  /* ---------- Сборка точек из полей ---------- */
  function pointOf(slotCity, slotStreet) {
    // приоритет улице (точнее), иначе город
    if (state[slotStreet]) return state[slotStreet];
    if (state[slotCity]) return state[slotCity];
    return null;
  }
  function resolve() {
    var a, b;
    if (state.trip === 'city') {
      // по городу: обе улицы в Вроцлаве; если улицы нет — центр Вроцлава
      a = state.astreet || WROC;
      b = state.bstreet || WROC;
    } else {
      // за город: (город+улица) для каждой точки
      a = pointOf('acity', 'astreet');
      b = pointOf('bcity', 'bstreet');
    }
    var changed = (a && state.a !== a) || (b && state.b !== b) || (!a && state.a) || (!b && state.b);
    state.a = a; state.b = b;
    if (changed) {
      if (a && b) {
        fetchKms(a, b, function (km) { state.km = km; recalc(); });
      } else { state.km = null; recalc(); }
    } else recalc();
  }

  /* ---------- Километраж ---------- */
  function haversine(a, b) {
    var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
    var x = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function fetchKms(a, b, cb) {
    function fb() { return Math.max(1, Math.round(haversine(a, b) * 1.3)); }
    fetch('https://router.project-osrm.org/route/v1/driving/' + a.lon + ',' + a.lat + ';' + b.lon + ',' + b.lat + '?overview=false')
      .then(function (r) { return r.json(); })
      .then(function (d) { cb(d && d.routes && d.routes[0] ? Math.max(1, Math.round(d.routes[0].distance / 1000)) : fb()); })
      .catch(function () { cb(fb()); });
  }

  /* ---------- Прогрессив ---------- */
  function cityExtra(km) {
    var over = Math.max(0, km - CITY_FREE), total = 0, rest = over, i = 0;
    while (rest > 0 && i < PROG.length) { var take = Math.min(rest, PROG[i].upto); total += take * PROG[i].rate; rest -= take; i++; }
    return Math.round(total);
  }

  /* ---------- Смета ---------- */
  function recalc() {
    if (!rowsEl) return;
    var g = state.g;
    var floorAdd = state.floor === 'yes' ? FLOOR[g] : 0;
    var insAdd = state.ins ? INSURANCE[g] : 0;
    if (floorPriceEl) floorPriceEl.textContent = '+ ' + FLOOR[g] + ' zł';

    var rows = [];
    var kmReady = state.a && state.b && state.km != null;
    var base = state.trip === 'out' && kmReady ? OUT_BASE[g] : RATES[g].base;
    rows.push({ k: D.gab + gname[g], v: base + ' zł' });

    var kmAdd = 0;
    if (kmReady) {
      if (state.trip === 'city') {
        var ex = cityExtra(state.km); kmAdd = ex;
        rows.push({ k: D.km + ' (' + state.km + ', ' + D.kmf + ')', v: ex ? '+' + ex + ' zł' : D.inc });
      } else {
        var out = Math.max(0, state.km - OUT_FREE); kmAdd = Math.round(out * OUT_KM);
        rows.push({ k: D.kmo + ' (' + out + ' × 3,75)', v: out ? '+' + kmAdd + ' zł' : D.inc });
      }
    } else rows.push({ k: D.route, v: D.pick });

    if (floorAdd) rows.push({ k: D.floor, v: '+' + floorAdd + ' zł' });
    if (insAdd) rows.push({ k: D.ins, v: '+' + insAdd + ' zł' });

    var total = base + kmAdd + floorAdd + insAdd;
    rowsEl.innerHTML = '';
    rows.forEach(function (r) {
      var d = document.createElement('div'); d.className = 'sum-row';
      var s = document.createElement('span'); s.textContent = r.k;
      var b = document.createElement('b'); b.textContent = r.v;
      d.appendChild(s); d.appendChild(b); rowsEl.appendChild(d);
    });
    totalEl.textContent = Math.round(total) + ' zł';
  }

  /* ---------- Привязка параметров ---------- */
  function bindSeg(id, field, valAttr) {
    var box = e(id); if (!box) return;
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      box.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      var v = b.getAttribute(valAttr);
      state[field] = v;
      if (field === 'g') { var h = e('gab-hint'); if (h) h.textContent = RATES[state.g].note || ''; }
      if (field === 'trip') setTrip(v);
      else recalc();
    });
  }
  var ins = e('insurance');
  if (ins) ins.addEventListener('change', function () { state.ins = ins.checked; recalc(); });

  bindSeg('gabarit', 'g', 'data-g');
  bindSeg('floor', 'floor', 'data-f');
  bindSeg('trip', 'trip', 'data-t');

  /* Адреса */
  bindGeocode('af-city', 'suggest-af-city', 'acity', null);
  bindGeocode('af-street', 'suggest-af-street', 'astreet', 'af-city');
  bindGeocode('at-city', 'suggest-at-city', 'bcity', null);
  bindGeocode('at-street', 'suggest-at-street', 'bstreet', 'at-city');

  setTrip('city');
  recalc();
})();