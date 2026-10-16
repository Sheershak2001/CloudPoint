# CloudPoint

An API-based weather application that shows real-time weather on a Google Map. Click anywhere on the map or search for a place to see current conditions and a 5-day forecast.

**Stack:** JavaScript, Node.js, Express, Handlebars, Google Maps JavaScript API, OpenWeatherMap API

## Features

- Interactive Google Map: click any point to get its weather
- Place search (Google Geocoding) and "use my location"
- Current conditions: temperature, feels-like, humidity, wind, pressure, visibility, sunrise and sunset in the place's local time
- 5-day forecast with daily high and low
- Live map overlays: clouds, precipitation, temperature, wind, pressure
- Celsius / Fahrenheit toggle
- Recent searches saved in the browser
- The OpenWeatherMap key stays on the server (the browser only talks to `/api/weather` and `/tiles/...`)

## Setup

1. Install Node.js 18 or newer.
2. Get two API keys:
   - **Google Maps**: in Google Cloud Console, enable *Maps JavaScript API* and *Geocoding API*, then create a key (restrict it to your site's URL).
   - **OpenWeatherMap**: create a free key at https://openweathermap.org/api (new keys can take a little while to activate).
3. Install and configure:

   ```bash
   npm install
   cp .env.example .env
   # edit .env and paste your two keys
   npm start
   ```

4. Open http://localhost:3000

## Project structure

```
server.js              Express server, weather API proxy, map tile proxy
views/layouts/main.hbs Handlebars layout
views/home.hbs         Main page
public/js/app.js       Map, search, weather rendering
public/css/style.css   Styles
```

## API

`GET /api/weather?lat=<number>&lng=<number>&units=metric|imperial` returns current weather plus a 5-day forecast as JSON.
