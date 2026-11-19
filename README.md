# MyEMS Home Energy & Carbon Manager

A responsive household energy and carbon dashboard created as a major-project demo and published through GitHub Pages. It adapts MyEMS energy monitoring to a household-scale interface.

## Open or run the demo

- Deployed site: https://akshitranacs28-netizen.github.io/MAJOR-PROJECT/
- Standalone file: open `Home-Energy-Carbon-Manager.html` in a current browser.
- MyEMS web folder: open `myems-web/public/home-energy/index.html` directly or serve the MyEMS web app and visit `/home-energy/`.

The static demo needs no build step, backend, database, or account. Google Fonts are optional; system fonts are used if offline.

## Feature areas

- **Overview:** household electricity, estimated bill, emissions, solar generation, appliance breakdown, recommendations, and CSV export.
- **Energy usage:** consumption and solar profile charts, period summaries, peak-demand window, appliance loads, and meter-source status.
- **Carbon footprint:** factor-based CO₂e estimate, target progress, appliance-level estimates, and a data-quality checklist.
- **Appliances:** sample power, monthly kWh, room, emissions estimate, demo switches, and a simulated pairing flow.
- **Insights & goals:** sample-based energy-saving actions and a browser-local reduction goal.
- **AI energy coach:** household profile, question-and-answer screen, tailored local recommendations, and optional live answers through the existing MyEMS DeepSeek proxy.
- **Watt side character:** a floating companion available on every screen with quick prompts, chat, and a shortcut to personalize the household profile.
- **Google Home integration:** setup requirements, integration roadmap, and explicit status that no account or device is connected.
- **Settings:** editable tariff and regional emissions factor stored in the current browser.

## AI energy coach

The coach collects occupant count, home size, monthly kWh, cooling hours, water-heater minutes, solar availability, and the user’s main priority. Its profile stays in the browser by default. Local personalized guidance works in the static demo and clearly identifies itself as rule-based; it does not call an AI provider.

To enable live AI answers, serve the page from a signed-in MyEMS installation with `/api/ai/deepseek/chat` available and configure `DEEPSEEK_API_KEY` on the MyEMS server. The coach uses the existing authenticated MyEMS proxy, which keeps the provider credential server-side. The user must turn on the explicit “Use live MyEMS AI” option before a question and household profile are sent to the backend/provider. The GitHub Pages deployment has no MyEMS API server, so it runs in local mode unless hosted alongside a configured MyEMS API. Do not put AI provider keys in this HTML or in browser storage.

## Google Home API scope

The deployed project is a static browser page. Google's Home APIs are native mobile SDKs for Android (Kotlin) and iOS (Swift); this page cannot directly launch the Home permission flow or read/control Google Home devices. A real connection requires a native companion app, OAuth setup, user consent for a home structure and supported devices, and a secure integration bridge before readings can be shown here. An energy meter source is still needed for accurate kWh; a device state alone is not necessarily an energy measurement.

Google's developer documentation currently notes that production Developer Console registration is not yet available/coming soon. Check the [Home APIs documentation](https://developers.home.google.com/apis), [Android getting started guide](https://developers.home.google.com/apis/android/get-started), and [permissions guide](https://developers.home.google.com/apis/android/permissions) before planning implementation or release.

## Demo-data and calculations

All household readings, device consumption, solar values, trends, and savings recommendations are illustrative. Device switches affect only the local demo interface and never control physical hardware. The pairing form creates a fictional local sample record and does not contact an account, Wi-Fi network, or device.

- Estimated bill = grid electricity (kWh) × electricity tariff (₹/kWh).
- Estimated carbon = grid electricity (kWh) × grid emissions factor (kg CO₂e/kWh).
- Defaults are ₹8/kWh and 0.73 kg CO₂e/kWh; replace them with sourced local values for a real study.
- Solar generation is displayed separately and is not subtracted from the grid-use estimate.
- Goal progress and recommendation savings are examples, not verified meter reductions.

## Connecting live MyEMS data

For a live MyEMS deployment, configure a home as a MyEMS space and add import/export and PV meters. Replace demo readings with authenticated MyEMS API values and map timestamps, units, and meter identities into the dashboard. Keep API credentials server-side; never place production secrets in a static page.

The standalone module is under `myems-web/public/home-energy/`; it does not require changing MyEMS enterprise routes or running the full Python/database stack. See the upstream [MyEMS repository](https://github.com/MyEMS/myems) and [community feature documentation](https://myems.cn/en/docs/community/).



## Live Gemini energy coach (Vercel)

This repository includes a Vercel Python function at `/api/ai/deepseek/chat` that powers Watt's multi-turn conversation with Gemini. Deploy this repository as a Vercel project, then add `GEMINI_API_KEY` in **Project Settings → Environment Variables** and redeploy. The API key remains on the server and is never placed in the browser.

The deployed site on Vercel calls its own API automatically. To keep using the GitHub Pages site, enter the Vercel project URL in the coach's **Live AI backend URL** field and enable **Use live AI for answers**. The API allows the GitHub Pages origin by default. Vercel deployment URLs are allowed automatically.

The function uses `gemini-3.5-flash-lite` by default and accepts `GEMINI_MODEL` to override it. Its in-memory rate limit is best-effort on serverless instances; monitor AI usage for a public demo. See [Vercel Python Functions](https://vercel.com/docs/functions/runtimes/python), [Vercel environment variables](https://vercel.com/docs/environment-variables), and [Gemini models](https://ai.google.dev/gemini-api/docs/models).
