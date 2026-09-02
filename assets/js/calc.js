/* ============================================================
   CALC.JS — калькулятор цены перевозки РУБИКОН
   Автоподбор адресов: OpenStreetMap Nominatim (+ PL гео)
   Расчёт км: маршрут OSRM, запасной план — прямая линия ×1.3
   Формула цены — из prajs.md. Многоязычный (RU/PL/EN).
   ============================================================ */
(function () {
  'use strict';

  var lang = (document.documentElement.getAttribute('lang') || 'ru').toLowerCase();

  var T = {
    ru: {
      g: { s: 'малый', m: 'средний', l: 'крупный' },
      notes: {
        s: 'коробки · кресло · ТВ · стиральная машина',
        m: 'стол · холодильник · тумба · шкафчик',
        l: 'диван · шкаф · кровать 200 · паллета'
      },
      nores: 'Ничего не нашлось — попробуйте город и улицу иначе.',
      gabarit: 'Габарит — ',
      km: 'Км',
      km_free: 'первые 5 включены',
      km_out: 'Км сверх 30',
      route: 'Маршрут',
      route_pick: 'выберите «Откуда» и «Куда»',
      included: 'включены',
      floor: 'Подъём без лифта',
      ins: 'Страховка груза'
    },
    pl: {
      g: { s: 'mały', m: 'średni', l: 'duży' },
      notes: {
        s: 'kartony · fotel · TV · pralka',
        m: 'stół · lodówka · komoda · szafka',
        l: 'sofa · szafa · łóżko 200 · paleta'
      },
      nores: 'Nic nie znaleziono — spróbuj inaczej wpisać miasto i ulicę.',
      gabarit: 'Wymiar — ',
      km: 'km',
      km_free: 'pierwsze 5 km w cenie',
      km_out: 'km powyżej 30',
      route: 'Trasa',
      route_pick: 'wybierz «Skąd» i «Dokąd»',
      included: 'w cenie',
      floor: 'Wniesienie bez windy',
      ins: 'Ubezpieczenie ładunku'
    },
    en: {
      g: { s: 'small', m: 'medium', l: 'large' },
      notes: {
        s: 'boxes · armchair · TV · washing machine',
        m: 'table · fridge · cabinet · sideboard',
        l: 'sofa · wardrobe · bed 200 · pallet'
      },
      nores: 'Nothing found — try typing the city and street differently.',
      gabarit: 'Load — ',
      km: 'km',
      km_free: 'first 5 km included',
      km_out: 'km over 30',
      route: 'Route',
      route_pick: 'pick «From» and «To»',
      included: 'included',
      floor: 'Carrying without lift',
      ins: 'Cargo insurance'
    }
  };
  var D = T[lang] || T.ru;

  /* --- Тарифы (источник: rubric/tech/prajs.md) --- */
  var RATES = {
    s: { base: 59, note: D.notes.s },
    m: { base: 99, note: D.notes.m },
    l: { base: 149, note: D.notes.l }
  };
  var FLOOR = { s: 30, m: 50, l: 70 };   // этаж без лифта — по габариту
  var CITY_FREE = 5;
  var PROG = [{ upto: 3, rate: 2.50 }, { upto: 2, rate: 2.75 }, { upto: Infinity, rate: 3.00 }];
  var OUT_FREE = 30;
  var OUT_KM = 3.75;
  var OUT_BASE = { s: 179, m: 249, l: 359 };
  var INSURANCE = { s: 15, m: 25, l: 35 };

  var state = {
    a: null, b: null,
    g: 'm',
    floor: 'no',
    trip: 'city',
    ins: false,
    km: null
  };

  var NOMINATIM = 'https://nominatim.openstreetmap.org/search';

  /* ---------- DOM ---------- */
  var rowsEl = document.getElementById('sum-rows');
  var totalEl = document.getElementById('sum-total');
  var floorPriceEl = document.getElementById('floor-price');

  /* ---------- Автоподбор адресов ---------- */
  function normRes(p) {
    var a = p.address || {};
    var city = a.city || a.town || a.village || a.municipality || '';
    var clean = [a.road, city].filter(Boolean).join(', ') + (a.postcode ? ', ' + a.postcode : '');
    if (!a.road && !city) clean = p.display_name.split(',')[0];
    var sub = [a.postcode, a.state || a.county].filter(Boolean).join(' · ');
    return { lat: parseFloat(p.lat), lon: parseFloat(p.lon), clean: clean, sub: sub };
  }

  function bindGeocode(inputId, suggestId, slot) {
    var input = document.getElementById(inputId);
    var box = document.getElementById(suggestId);
    var timer = null;

    function hide() { box.classList.remove('open'); }

    function show(items) {
      box.innerHTML = '';
      if (!items.length) {
        var nr = document.createElement('div');
        nr.className = 'nores';
        nr.textContent = D.nores;
        box.appendChild(nr);
      } else {
        items.forEach(function (it) {
          var d = document.createElement('div');
          d.className = 'opt';
          d.innerHTML = '<strong></strong><small></small>';
          d.querySelector('strong').textContent = it.clean;
          d.querySelector('small').textContent = it.sub;
          d.addEventListener('mousedown', function (e) {
            e.preventDefault();
            state[slot] = { lat: it.lat, lon: it.lon, label: it.clean };
            input.value = it.clean;
            hide();
            onAddrChanged();
          });
          box.appendChild(d);
        });
      }
      box.classList.add('open');
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      hide();
      state[slot] = null;
      onAddrChanged();
      var q = input.value.trim();
      if (q.length < 3) return;
      timer = setTimeout(function () {
        fetch(NOMINATIM + '?q=' + encodeURIComponent(q) +
              '&countrycodes=pl&format=json&limit=6&accept-language=' + lang)
          .then(function (r) { return r.json(); })
          .then(function (res) { show((res || []).map(normRes)); })
          .catch(function () {});
      }, 350);
    });

    document.addEventListener('click', function (e) {
      if (!input.contains(e.target)) hide();
    });
  }

  /* ---------- Адреса выбраны → считаем км ---------- */
  function onAddrChanged() {
    if (!state.a || !state.b) { state.km = null; recalc(); return; }
    fetchKms(state.a, state.b, function (km) {
      state.km = km;
      recalc();
    });
  }

  /* ---------- Километраж ---------- */
  function haversine(a, b) {
    var R = 6371;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLon = (b.lon - a.lon) * Math.PI / 180;
    var x = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*
            Math.sin(dLon/2)*Math.sin(dLon/2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function fetchKms(a, b, cb) {
    function fallback() { return Math.max(1, Math.round(haversine(a, b) * 1.3)); }
    fetch('https://router.project-osrm.org/route/v1/driving/' +
          a.lon + ',' + a.lat + ';' + b.lon + ',' + b.lat + '?overview=false')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        cb(d && d.routes && d.routes[0]
           ? Math.max(1, Math.round(d.routes[0].distance / 1000))
           : fallback());
      })
      .catch(function () { cb(fallback()); });
  }

  /* ---------- Прогрессив по км ---------- */
  function cityExtra(km) {
    var over = Math.max(0, km - CITY_FREE);
    var total = 0, rest = over, i = 0;
    while (rest > 0 && i < PROG.length) {
      var take = Math.min(rest, PROG[i].upto);
      total += take * PROG[i].rate;
      rest -= take;
      i++;
    }
    return Math.round(total);
  }

  /* ---------- Итог ---------- */
  function recalc() {
    if (!rowsEl) return;
    var g = state.g;
    var floorAdd = (state.floor === 'yes') ? FLOOR[g] : 0;
    var insAdd = state.ins ? INSURANCE[g] : 0;

    if (floorPriceEl) floorPriceEl.textContent = '+ ' + FLOOR[g] + ' zł';

    var rows = [];
    var kmReady = state.a && state.b && state.km != null;

    var base = (state.trip === 'out' && kmReady) ? OUT_BASE[g] : RATES[g].base;
    rows.push({ k: D.gabarit + D.g[g], v: base + ' zł' });

    var kmAdd = 0;
    if (kmReady) {
      if (state.trip === 'city') {
        var ex = cityExtra(state.km);
        kmAdd = ex;
        rows.push({ k: D.km + ' (' + state.km + ', ' + D.km_free + ')',
                    v: ex ? '+' + ex + ' zł' : D.included });
      } else {
        var out = Math.max(0, state.km - OUT_FREE);
        kmAdd = Math.round(out * OUT_KM);
        rows.push({ k: D.km_out + ' (' + out + ' × 3,75)',
                    v: out ? '+' + kmAdd + ' zł' : D.included });
      }
    } else {
      rows.push({ k: D.route, v: D.route_pick });
    }

    if (floorAdd) rows.push({ k: D.floor, v: '+' + floorAdd + ' zł' });
    if (insAdd) rows.push({ k: D.ins, v: '+' + insAdd + ' zł' });

    var total = base + kmAdd + floorAdd + insAdd;

    rowsEl.innerHTML = '';
    rows.forEach(function (r) {
      var d = document.createElement('div');
      d.className = 'sum-row';
      var s = document.createElement('span'); s.textContent = r.k;
      var b = document.createElement('b'); b.textContent = r.v;
      d.appendChild(s); d.appendChild(b);
      rowsEl.appendChild(d);
    });
    totalEl.textContent = Math.round(total) + ' zł';
  }

  /* ---------- Привязка сегментов ---------- */
  function bindSeg(id, field, valAttr) {
    var box = document.getElementById(id);
    if (!box) return;
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      box.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      state[field] = b.getAttribute(valAttr);
      if (field === 'g') {
        var hint = document.getElementById('gab-hint');
        if (hint) hint.textContent = RATES[state.g].note;
      }
      recalc();
    });
  }

  var ins = document.getElementById('insurance');
  if (ins) ins.addEventListener('change', function () { state.ins = ins.checked; recalc(); });

  bindSeg('gabarit', 'g', 'data-g');
  bindSeg('floor', 'floor', 'data-f');
  bindSeg('trip', 'trip', 'data-t');

  bindGeocode('addr-a', 'suggest-a', 'a');
  bindGeocode('addr-b', 'suggest-b', 'b');

  recalc();
})();