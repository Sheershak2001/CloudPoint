(function () {
  const DEFAULT_CENTER = { lat: 26.8467, lng: 80.9462 }; // Lucknow
  const RECENT_KEY = 'cloudpoint.recent';

  let map;
  let marker;
  let geocoder;
  let units = 'metric';
  let lastPos = null;
  let overlayName = '';

  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const currentEl = $('current');
  const forecastEl = $('forecast');

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('error', !!isError);
    statusEl.classList.remove('hidden');
  }

  // ---------- Map ----------
  window.initMap = function () {
    map = new google.maps.Map($('map'), {
      center: DEFAULT_CENTER,
      zoom: 5,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
    geocoder = new google.maps.Geocoder();
    marker = new google.maps.Marker({ map, visible: false });

    map.addListener('click', (e) => selectPosition(e.latLng.lat(), e.latLng.lng()));
    loadRecent();
    selectPosition(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, false);
  };

  function applyOverlay() {
    if (!map) return;
    map.overlayMapTypes.clear();
    if (!overlayName) return;
    const layer = overlayName;
    map.overlayMapTypes.push(
      new google.maps.ImageMapType({
        getTileUrl(coord, zoom) {
          const max = 1 << zoom;
          if (coord.y < 0 || coord.y >= max) return null;
          const x = ((coord.x % max) + max) % max; // wrap horizontally
          return `/tiles/${layer}/${zoom}/${x}/${coord.y}.png`;
        },
        tileSize: new google.maps.Size(256, 256),
        opacity: 0.7,
        name: layer,
      })
    );
  }

  // ---------- Weather ----------
  async function selectPosition(lat, lng, pan = true) {
    lastPos = { lat, lng };
    marker.setPosition({ lat, lng });
    marker.setVisible(true);
    if (pan) map.panTo({ lat, lng });
    setStatus('Loading weather...');

    try {
      const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}&units=${units}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      render(data);
    } catch (err) {
      currentEl.classList.add('hidden');
      forecastEl.classList.add('hidden');
      setStatus(err.message, true);
    }
  }

  function fmtTime(unix, tz) {
    const d = new Date((unix + tz) * 1000);
    return d.toISOString().slice(11, 16); // HH:MM in the place's local time
  }

  function render(w) {
    const t = units === 'metric' ? '°C' : '°F';
    const wind = units === 'metric' ? `${w.windSpeed} m/s` : `${w.windSpeed} mph`;
    statusEl.classList.add('hidden');

    currentEl.innerHTML = `
      <div class="now">
        <img src="https://openweathermap.org/img/wn/${esc(w.icon)}@2x.png" alt="${esc(w.description)}" width="80" height="80">
        <div>
          <h2>${esc(w.place)}</h2>
          <div class="temp">${w.temp}${t}</div>
          <div class="desc">${esc(w.description)} &middot; feels like ${w.feelsLike}${t}</div>
        </div>
      </div>
      <dl class="stats">
        <div><dt>Humidity</dt><dd>${w.humidity}%</dd></div>
        <div><dt>Wind</dt><dd>${esc(wind)}</dd></div>
        <div><dt>Pressure</dt><dd>${w.pressure} hPa</dd></div>
        <div><dt>Visibility</dt><dd>${w.visibility != null ? (w.visibility / 1000).toFixed(1) + ' km' : '-'}</dd></div>
        <div><dt>Sunrise</dt><dd>${fmtTime(w.sunrise, w.timezone)}</dd></div>
        <div><dt>Sunset</dt><dd>${fmtTime(w.sunset, w.timezone)}</dd></div>
      </dl>`;
    currentEl.classList.remove('hidden');

    forecastEl.innerHTML =
      '<h2>5-day forecast</h2><div class="days">' +
      w.daily
        .map((d) => {
          const day = new Date(d.date + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
          return `<div class="day">
            <span>${esc(day)}</span>
            <img src="https://openweathermap.org/img/wn/${esc(d.icon)}.png" alt="${esc(d.description)}" width="40" height="40">
            <strong>${d.max}°</strong><small>${d.min}°</small>
          </div>`;
        })
        .join('') +
      '</div>';
    forecastEl.classList.remove('hidden');
  }

  // ---------- Search ----------
  $('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('search-input').value.trim();
    if (!q || !geocoder) return;
    setStatus('Searching...');
    geocoder.geocode({ address: q }, (results, status) => {
      if (status !== 'OK' || !results[0]) {
        setStatus('Could not find that place.', true);
        return;
      }
      const loc = results[0].geometry.location;
      map.fitBounds(results[0].geometry.viewport);
      selectPosition(loc.lat(), loc.lng(), false);
      saveRecent({ name: results[0].formatted_address, lat: loc.lat(), lng: loc.lng() });
    });
  });

  $('locate-btn').addEventListener('click', () => {
    if (!navigator.geolocation) return setStatus('Geolocation is not supported in this browser.', true);
    setStatus('Finding your location...');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        map.setZoom(10);
        selectPosition(p.coords.latitude, p.coords.longitude);
      },
      () => setStatus('Location permission was denied.', true),
      { timeout: 10000 }
    );
  });

  // ---------- Controls ----------
  function setUnits(u) {
    units = u;
    $('unit-c').classList.toggle('active', u === 'metric');
    $('unit-f').classList.toggle('active', u === 'imperial');
    if (lastPos) selectPosition(lastPos.lat, lastPos.lng, false);
  }
  $('unit-c').addEventListener('click', () => setUnits('metric'));
  $('unit-f').addEventListener('click', () => setUnits('imperial'));

  $('layer-select').addEventListener('change', (e) => {
    overlayName = e.target.value;
    applyOverlay();
  });

  // ---------- Recent searches (localStorage) ----------
  function readRecent() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function writeRecent(list) {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (e) {
      /* storage unavailable - ignore */
    }
  }
  function saveRecent(item) {
    const list = readRecent().filter((r) => r.name !== item.name);
    list.unshift(item);
    writeRecent(list.slice(0, 6));
    loadRecent();
  }
  function loadRecent() {
    const list = readRecent();
    const wrap = $('recent-wrap');
    const ul = $('recent');
    ul.innerHTML = '';
    wrap.classList.toggle('hidden', list.length === 0);
    list.forEach((r) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = r.name;
      b.addEventListener('click', () => {
        map.setZoom(10);
        selectPosition(r.lat, r.lng);
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }
  $('clear-recent').addEventListener('click', () => {
    writeRecent([]);
    loadRecent();
  });
})();
