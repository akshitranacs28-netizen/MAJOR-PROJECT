const https = require('https');

// India CEA Standard Grid Emission Factor
const CEA_EMISSION_FACTOR = 0.675; // kg CO2e / kWh

// Fallback coordinates for common Indian cities if geocoding is unavailable
const CITY_COORDINATES = {
  'faridabad': { lat: 28.4089, lon: 77.3178 },
  'delhi': { lat: 28.6139, lon: 77.2090 },
  'noida': { lat: 28.5355, lon: 77.3910 },
  'gurugram': { lat: 28.4595, lon: 77.0266 },
  'mumbai': { lat: 19.0760, lon: 72.8777 },
  'bengaluru': { lat: 12.9716, lon: 77.5946 },
  'bangalore': { lat: 12.9716, lon: 77.5946 },
  'chennai': { lat: 13.0827, lon: 80.2707 },
  'kolkata': { lat: 22.5726, lon: 88.3639 },
  'hyderabad': { lat: 17.3850, lon: 78.4867 },
  'pune': { lat: 18.5204, lon: 73.8567 },
  'jaipur': { lat: 26.9124, lon: 75.7873 }
};

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'CarbonSense-AI/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', err => resolve(null));
  });
}

// 1. Open-Meteo Geocoding
async function getCoordinates(cityName) {
  const cleanCity = (cityName || 'Faridabad').trim().toLowerCase();
  if (CITY_COORDINATES[cleanCity]) {
    return { ...CITY_COORDINATES[cleanCity], city: cityName };
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;
    const res = await httpsGet(url);
    if (res && res.results && res.results.length > 0) {
      return {
        lat: res.results[0].latitude,
        lon: res.results[0].longitude,
        city: res.results[0].name
      };
    }
  } catch (e) {
    console.warn('Geocoding error, using fallback coordinates');
  }

  return { lat: 28.4089, lon: 77.3178, city: cityName || 'Faridabad' };
}

// 2. Open-Meteo Historical Weather Archive
async function getMonthlyWeatherData(lat, lon, startDate, endDate) {
  // Ensure valid ISO date format YYYY-MM-DD
  let start = startDate || '2026-06-01';
  let end = endDate || '2026-06-30';

  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=temperature_2m_mean&timezone=auto`;
    const res = await httpsGet(url);
    if (res && res.daily && res.daily.temperature_2m_mean && res.daily.temperature_2m_mean.length > 0) {
      const temps = res.daily.temperature_2m_mean.filter(t => t !== null);
      if (temps.length > 0) {
        return temps;
      }
    }
  } catch (e) {
    console.warn('Weather archive fetch failed, using seasonal fallback');
  }

  // Realistic summer default (e.g., June in North India: ~33°C - 38°C)
  return Array(30).fill(0).map((_, i) => 32 + (i % 7));
}

// 3. Weather-Aware NILM Disaggregation Engine
async function disaggregateBill(billData) {
  const totalKwh = Math.max(50, parseFloat(billData.total_kwh) || 480);
  const totalAmount = Math.max(100, parseFloat(billData.total_amount) || Math.round(totalKwh * 8.0));
  const effectiveTariff = totalAmount / totalKwh;
  const city = billData.city || 'Faridabad';
  const startDate = billData.billing_start_date || '2026-06-01';
  const endDate = billData.billing_end_date || '2026-06-30';

  // 1. Fetch Location Coordinates
  const coords = await getCoordinates(city);

  // 2. Fetch Historical Temperatures
  const dailyTemps = await getMonthlyWeatherData(coords.lat, coords.lon, startDate, endDate);
  const daysCount = dailyTemps.length || 30;
  const avgTemp = dailyTemps.reduce((a, b) => a + b, 0) / daysCount;

  // 3. Degree Days Calculation
  // Base 24°C for Cooling Degree Days (CDD); Base 18°C for Heating Degree Days (HDD)
  const cdd = dailyTemps.reduce((sum, t) => sum + Math.max(0, t - 24), 0);
  const hdd = dailyTemps.reduce((sum, t) => sum + Math.max(0, 18 - t), 0);

  // 4. Weather-Sensitive Load Weights
  // Dynamic scaling based on climate intensity
  let acWeight = cdd > 0 ? Math.min(0.55, 0.20 + (cdd / (daysCount * 12)) * 0.35) : 0.05;
  let geyserWeight = hdd > 0 ? Math.min(0.35, 0.10 + (hdd / (daysCount * 10)) * 0.25) : 0.08;
  let fridgeWeight = 0.12 + Math.max(0, (avgTemp - 25) * 0.003); // higher ambient = slightly more compressor work
  let washerWeight = 0.05;
  let lightingFanWeight = 0.18;
  let baseloadWeight = 0.08;

  // Normalize weights to sum to 1.0
  const sumWeights = acWeight + geyserWeight + fridgeWeight + washerWeight + lightingFanWeight + baseloadWeight;
  const scale = 1.0 / sumWeights;

  const acKwh = Math.round(totalKwh * acWeight * scale * 10) / 10;
  const geyserKwh = Math.round(totalKwh * geyserWeight * scale * 10) / 10;
  const fridgeKwh = Math.round(totalKwh * fridgeWeight * scale * 10) / 10;
  const washerKwh = Math.round(totalKwh * washerWeight * scale * 10) / 10;
  const lightingKwh = Math.round(totalKwh * lightingFanWeight * scale * 10) / 10;
  const baseloadKwh = Math.max(0, Math.round((totalKwh - (acKwh + geyserKwh + fridgeKwh + washerKwh + lightingKwh)) * 10) / 10);

  // Derive runtime hours, ON-counts, and peak cycles (18:00-23:00)
  // Split AC: rated ~1.5 kW
  const acHours = Math.round((acKwh / 1.5) * 10) / 10;
  const acOnCount = Math.round(daysCount * (acHours > 0 ? (acHours > 120 ? 3 : 2) : 0));
  const acPeakCycles = Math.round(acOnCount * 0.65); // ~65% runs during evening/night peak

  // Water Geyser: rated ~2.0 kW
  const geyserHours = Math.round((geyserKwh / 2.0) * 10) / 10;
  const geyserOnCount = Math.round(daysCount * (geyserHours > 10 ? 2 : 1));
  const geyserPeakCycles = Math.round(geyserOnCount * 0.30); // ~30% evening bath cycles

  // Refrigerator: rated ~0.15 kW continuous equivalent
  const fridgeHours = Math.round(daysCount * 24);
  const fridgeOnCount = Math.round(daysCount * 14); // cycling ~14 times a day
  const fridgePeakCycles = Math.round(daysCount * 3);

  // Washing Machine: rated ~0.5 kW
  const washerHours = Math.round((washerKwh / 0.5) * 10) / 10;
  const washerOnCount = Math.round(washerHours / 1.2);
  const washerPeakCycles = Math.round(washerOnCount * 0.20);

  // Lights & Fans: rated ~0.35 kW
  const lightingHours = Math.round((lightingKwh / 0.35) * 10) / 10;
  const lightingOnCount = Math.round(daysCount * 4);
  const lightingPeakCycles = Math.round(daysCount * 3);

  // Baseload (Phantom Draw): rated ~0.05 kW
  const baseloadHours = Math.round(daysCount * 24);
  const baseloadOnCount = daysCount;
  const baseloadPeakCycles = Math.round(daysCount * 0.21);

  const appliances = [
    {
      name: "Split AC (1.5 Ton)",
      category: "cooling",
      sync_mode: "AI-Inferred (NILM Weather)",
      on_count: acOnCount,
      runtime_hours: acHours,
      peak_cycles: acPeakCycles,
      kwh: acKwh,
      cost: Math.round(acKwh * effectiveTariff),
      co2_kg: Math.round(acKwh * CEA_EMISSION_FACTOR * 10) / 10,
      source: "Tier 1: Weather NILM"
    },
    {
      name: "Water Geyser (Storage)",
      category: "heating",
      sync_mode: "AI-Inferred (NILM Weather)",
      on_count: geyserOnCount,
      runtime_hours: geyserHours,
      peak_cycles: geyserPeakCycles,
      kwh: geyserKwh,
      cost: Math.round(geyserKwh * effectiveTariff),
      co2_kg: Math.round(geyserKwh * CEA_EMISSION_FACTOR * 10) / 10,
      source: "Tier 1: Weather NILM"
    },
    {
      name: "Inverter Refrigerator",
      category: "refrigeration",
      sync_mode: "AI-Inferred (NILM Weather)",
      on_count: fridgeOnCount,
      runtime_hours: fridgeHours,
      peak_cycles: fridgePeakCycles,
      kwh: fridgeKwh,
      cost: Math.round(fridgeKwh * effectiveTariff),
      co2_kg: Math.round(fridgeKwh * CEA_EMISSION_FACTOR * 10) / 10,
      source: "Tier 1: Weather NILM"
    },
    {
      name: "Washing Machine",
      category: "laundry",
      sync_mode: "AI-Inferred (NILM Weather)",
      on_count: washerOnCount,
      runtime_hours: washerHours,
      peak_cycles: washerPeakCycles,
      kwh: washerKwh,
      cost: Math.round(washerKwh * effectiveTariff),
      co2_kg: Math.round(washerKwh * CEA_EMISSION_FACTOR * 10) / 10,
      source: "Tier 1: Weather NILM"
    },
    {
      name: "Lights & Ceiling Fans",
      category: "lighting",
      sync_mode: "AI-Inferred (NILM Weather)",
      on_count: lightingOnCount,
      runtime_hours: lightingHours,
      peak_cycles: lightingPeakCycles,
      kwh: lightingKwh,
      cost: Math.round(lightingKwh * effectiveTariff),
      co2_kg: Math.round(lightingKwh * CEA_EMISSION_FACTOR * 10) / 10,
      source: "Tier 1: Weather NILM"
    },
    {
      name: "Phantom Standby Draw",
      category: "baseload",
      sync_mode: "AI-Inferred (NILM Weather)",
      on_count: baseloadOnCount,
      runtime_hours: baseloadHours,
      peak_cycles: baseloadPeakCycles,
      kwh: baseloadKwh,
      cost: Math.round(baseloadKwh * effectiveTariff),
      co2_kg: Math.round(baseloadKwh * CEA_EMISSION_FACTOR * 10) / 10,
      source: "Tier 1: Weather NILM"
    }
  ];

  const totalCo2 = Math.round(totalKwh * CEA_EMISSION_FACTOR * 10) / 10;

  return {
    summary: {
      total_kwh: totalKwh,
      total_cost: totalAmount,
      total_co2_kg: totalCo2,
      effective_tariff: Math.round(effectiveTariff * 100) / 100,
      sync_source: "Bill AI Disaggregation",
      city: coords.city,
      avg_temp_c: Math.round(avgTemp * 10) / 10,
      cooling_degree_days: Math.round(cdd),
      heating_degree_days: Math.round(hdd),
      billing_period: `${startDate} to ${endDate}`,
      cea_grid_factor: CEA_EMISSION_FACTOR
    },
    appliances: appliances
  };
}

module.exports = {
  getCoordinates,
  getMonthlyWeatherData,
  disaggregateBill,
  CEA_EMISSION_FACTOR
};
