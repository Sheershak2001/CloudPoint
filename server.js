require('dotenv').config();
const path = require('path');
const express = require('express');
const { engine } = require('express-handlebars');

const app = express();
const PORT = process.env.PORT || 3000;
const OWM_KEY = process.env.OPENWEATHER_API_KEY;
const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;
const OWM = 'https://api.openweathermap.org/data/2.5';
const ALLOWED_LAYERS = ['clouds_new', 'precipitation_new', 'temp_new', 'wind_new', 'pressure_new'];

app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main' }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Pages ----------
app.get('/', (req, res) => {
  res.render('home', {
    mapsKey: MAPS_KEY,
    missingKeys: !MAPS_KEY || !OWM_KEY,
  });
});

// ---------- Weather API (proxy keeps the OpenWeatherMap key off the browser) ----------
app.get('/api/weather', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const units = req.query.units === 'imperial' ? 'imperial' : 'metric';

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'Valid lat and lng are required.' });
  }
  if (!OWM_KEY) {
    return res.status(500).json({ error: 'OPENWEATHER_API_KEY is not set on the server.' });
  }

  try {
    const qs = `lat=${lat}&lon=${lng}&units=${units}&appid=${OWM_KEY}`;
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`${OWM}/weather?${qs}`),
      fetch(`${OWM}/forecast?${qs}`),
    ]);
    if (!currentRes.ok || !forecastRes.ok) {
      return res.status(502).json({ error: 'Weather provider returned an error.' });
    }
    const current = await currentRes.json();
    const forecast = await forecastRes.json();

    res.json({
      place: [current.name, current.sys && current.sys.country].filter(Boolean).join(', ') || 'Selected location',
      lat,
      lng,
      units,
      temp: Math.round(current.main.temp),
      feelsLike: Math.round(current.main.feels_like),
      humidity: current.main.humidity,
      pressure: current.main.pressure,
      windSpeed: current.wind.speed,
      visibility: current.visibility,
      clouds: current.clouds ? current.clouds.all : null,
      description: current.weather[0].description,
      icon: current.weather[0].icon,
      sunrise: current.sys.sunrise,
      sunset: current.sys.sunset,
      timezone: current.timezone, // seconds offset from UTC
      daily: buildDaily(forecast.list, current.timezone),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch weather right now.' });
  }
});

// Group the 3-hour forecast into per-day min/max (up to 5 days)
function buildDaily(list, tzOffset) {
  const days = new Map();
  for (const item of list) {
    const local = new Date((item.dt + tzOffset) * 1000);
    const key = local.toISOString().slice(0, 10);
    const d = days.get(key) || { date: key, min: Infinity, max: -Infinity, icons: [], desc: [] };
    d.min = Math.min(d.min, item.main.temp_min);
    d.max = Math.max(d.max, item.main.temp_max);
    d.icons.push(item.weather[0].icon);
    d.desc.push(item.weather[0].description);
    days.set(key, d);
  }
  return [...days.values()].slice(0, 5).map((d) => ({
    date: d.date,
    min: Math.round(d.min),
    max: Math.round(d.max),
    icon: (d.icons[Math.floor(d.icons.length / 2)] || '01d').replace('n', 'd'),
    description: d.desc[Math.floor(d.desc.length / 2)],
  }));
}

// ---------- Weather map tiles (clouds, rain, temp, wind) ----------
app.get('/tiles/:layer/:z/:x/:y.png', async (req, res) => {
  const { layer, z, x, y } = req.params;
  if (!ALLOWED_LAYERS.includes(layer) || ![z, x, y].every((n) => /^\d+$/.test(n))) {
    return res.status(400).end();
  }
  if (!OWM_KEY) return res.status(500).end();
  try {
    const r = await fetch(`https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png?appid=${OWM_KEY}`);
    if (!r.ok) return res.status(r.status).end();
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=600');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (err) {
    res.status(502).end();
  }
});

app.listen(PORT, () => console.log(`CloudPoint running at http://localhost:${PORT}`));
