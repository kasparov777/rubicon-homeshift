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
  var OUT_FREE = 30, OUT_KM = 3.75;
  var INSURANCE = { s: 15, m: 25, l: 35 };
  var WROC = { lat: 51.1079, lon: 17.0385 };

  /* --- Основные города Польши (мгновенный подбор без ожидания API) --- */
  var PL_CITIES = [
    {n:'Warszawa',lat:52.2297,lon:21.0122},{n:'Kraków',lat:50.0647,lon:19.9445},
    {n:'Łódź',lat:51.7592,lon:19.4560},{n:'Wrocław',lat:51.1079,lon:17.0385},
    {n:'Poznań',lat:52.4064,lon:16.9252},{n:'Gdańsk',lat:54.3520,lon:18.6466},
    {n:'Szczecin',lat:53.4285,lon:14.5528},{n:'Bydgoszcz',lat:53.1235,lon:18.0084},
    {n:'Lublin',lat:51.2465,lon:22.5684},{n:'Białystok',lat:53.1325,lon:23.1688},
    {n:'Katowice',lat:50.2649,lon:19.0238},{n:'Gdynia',lat:54.5189,lon:18.5305},
    {n:'Częstochowa',lat:50.8118,lon:19.1203},{n:'Radom',lat:51.4027,lon:21.1471},
    {n:'Toruń',lat:53.0138,lon:18.5984},{n:'Sosnowiec',lat:50.2863,lon:19.1040},
    {n:'Rzeszów',lat:50.0412,lon:21.9991},{n:'Kielce',lat:50.8661,lon:20.6286},
    {n:'Olsztyn',lat:53.7784,lon:20.4801},{n:'Zielona Góra',lat:51.9356,lon:15.5062},
    {n:'Opole',lat:50.6751,lon:17.9213},{n:'Gorzów Wielkopolski',lat:52.7368,lon:15.2288},
    {n:'Wałbrzych',lat:50.7683,lon:16.2843},{n:'Zamość',lat:50.7231,lon:23.2525},
    {n:'Tarnów',lat:50.0121,lon:20.9858},{n:'Płock',lat:52.5463,lon:19.7065},
    {n:'Elbląg',lat:54.1561,lon:19.4045},{n:'Koszalin',lat:54.1943,lon:16.1714},
    {n:'Słupsk',lat:54.4641,lon:17.0285},{n:'Jelenia Góra',lat:50.9048,lon:15.7193},
    {n:'Legnica',lat:51.2073,lon:16.1615},{n:'Świdnica',lat:50.8440,lon:16.4898},
    {n:'Milicz',lat:51.5250,lon:17.2630},{n:'Oleśnica',lat:51.2100,lon:17.3800},
    {n:'Trzebnica',lat:51.3100,lon:17.0600},{n:'Syców',lat:51.3100,lon:17.6900},
    {n:'Góra',lat:51.6700,lon:16.5400},{n:'Wołów',lat:51.3400,lon:16.6400},
    {n:'Dzierżoniów',lat:50.7300,lon:16.6500},{n:'Ząbkowice Śląskie',lat:50.5900,lon:16.8100}
  ];
  function localCities(q) {
    var s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return PL_CITIES.filter(function (c) {
      return c.n.toLowerCase().indexOf(s) === 0;
    }).slice(0, 6);
  }

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
  function geocode(q, cb, placeOnly) {
    fetch(NOMINATIM + '?q=' + encodeURIComponent(q) + '&countrycodes=pl&format=json&addressdetails=1&limit=8&accept-language=' + lang)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var items = (res || []).map(normRes);
        if (placeOnly) items = items.filter(function (it) { return it.isPlace; });
        cb(items);
      })
      .catch(function () { cb([]); });
  }
  function normRes(p) {
    var a = p.address || {};
    var city = a.city || a.town || a.village || a.municipality || '';
    var street = a.road || a.pedestrian || a.footway || '';
    var streetFull = street + (a.house_number ? ' ' + a.house_number : '');
    var isPlace = (p.class === 'place') || !!(city && !streetFull);   // настоящий город/деревня, не воеводство/аэропорт/объект
    var clean = p.display_name.split(',')[0];
    if (streetFull) clean = streetFull + (city ? ', ' + city : '') + (a.postcode ? ', ' + a.postcode : '');
    else if (city) clean = city + (a.postcode ? ', ' + a.postcode : '');
    var sub = [a.postcode, a.state || a.county].filter(Boolean).join(' · ');
    return { lat: parseFloat(p.lat), lon: parseFloat(p.lon), clean: clean, sub: sub, isPlace: isPlace };
  }

  /* bindGeocode: slot — куда писать координаты {city|street}, ctxId — id поля города для контекста */
  function bindGeocode(inputId, suggestId, slot, ctxId) {
    var input = e(inputId), box = e(suggestId);
    if (!input || !box) return;
    var placeOnly = (slot === 'acity' || slot === 'bcity');   // поля города — только «места», не воеводства
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
            clearTimeout(timer);   // гасим отложенный геокодинг, чтобы опоздавший ответ не открыл список снова
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
      if (q.length < 2) return;
      var full = q;
      if (slot.indexOf('street') === 0) {
        // контекст города для поиска улицы
        var cityCtx = '';
        if (state.trip === 'city') {
          cityCtx = 'Wrocław';                        // скрытое поле города = Вроцлав
        } else if (ctxId) {
          var c = e(ctxId);
          if (c && c.value.trim()) cityCtx = c.value.trim();
        }
        if (cityCtx) full = q + ', ' + cityCtx;
        timer = setTimeout(function () { geocode(full, show, placeOnly); }, 320);
      } else {
        // поле города: сначала мгновенно подскажем из локального списка
        var locals = placeOnly ? localCities(q) : [];
        if (locals.length) {
          show(locals.map(function (c) {
            return { clean: c.n, sub: '', lat: c.lat, lon: c.lon, isPlace: true };
          }));
        } else {
          if (q.length >= 3) {
            timer = setTimeout(function () { geocode(full, show, placeOnly); }, 320);
          }
        }
      }
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

  function intercityExtra(km) {
    var withinCityFormula = cityExtra(Math.min(km, OUT_FREE));
    var beyondThirty = Math.max(0, km - OUT_FREE) * OUT_KM;
    return Math.round(withinCityFormula + beyondThirty);
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
    var base = RATES[g].base;
    rows.push({ k: D.gab + gname[g], v: base + ' zł' });

    var kmAdd = 0;
    if (kmReady) {
      if (state.trip === 'city') {
        var ex = cityExtra(state.km); kmAdd = ex;
        rows.push({ k: D.km + ' (' + state.km + ', ' + D.kmf + ')', v: ex ? '+' + ex + ' zł' : D.inc });
      } else {
        kmAdd = intercityExtra(state.km);
        rows.push({ k: D.km + ' (' + state.km + ', ' + D.kmf + ')', v: kmAdd ? '+' + kmAdd + ' zł' : D.inc });
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