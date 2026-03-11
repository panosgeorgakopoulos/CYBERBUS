# 🚌 CYBERBUS: The Smart Tour Bus Prototype

Welcome to the CYBERBUS project! This isn't just your standard transit tracker. It's a fully interactive, web-based prototype designed to simulate a next-generation smart tour bus cruising through the streets of Athens. 

I built this to explore how Human-Computer Interaction (HCI) might look in a futuristic public transport setting. It basically acts as a monolithic Progressive Web App (PWA) that serves two completely different experiences depending on who logs in: the passengers or the bus staff.

## 🌐 Live Demo
You can check out the live version of the project here: **[https://cyberbus-lew7.onrender.com](https://cyberbus-lew7.onrender.com)**

***Note:** The live backend is hosted on Render's free tier. If the site hasn't been visited in a while, the server goes to sleep to save resources. Please allow **up to 50 seconds** for the initial load if it's waking up. Once it's up, it runs perfectly!*

## 🌟 What's Inside?

The app is split into two main operational modes, accessible right from the sleek, gradient-heavy login screen.

### The Passenger Experience
If you log in as a passenger, you get to pick your seat. Once you're in, the dashboard acts as your personal in-flight entertainment and service system:
* **In-Seat Delivery:** You can browse a simulated menu from local Athenian street food spots and cafes (like "Coffee Route" or "Souvlaki GR"). You add stuff to your cart, apply custom options (like how sweet you want your coffee), and "check out" to have it delivered right to your selected seat.
* **AR & Tour Features:** This is where it gets fun. There's a live dashcam view that syncs up YouTube videos based on where the bus currently is on its route. Even cooler, there's an AR scanner that uses your device's camera. You point it at a landmark, and it sends the image frame to the backend where Google's Gemini Vision analyzes it to tell you what you're looking at.
* **Interactive Map & Trivia:** We've got a Leaflet-powered map tracking the route. As you approach stops like the Acropolis or Syntagma, the app throws pop quizzes at you. Get the trivia right, and you score a 10% discount on your food orders.
* **AI Assistant:** Need help? There's a built-in Gemini AI chat interface that acts as a virtual tour guide. You can even use voice recognition to talk to it.

### The Driver/Staff Dashboard
Enter the pin `12345` at login, and the UI completely flips to a central command interface for the bus operator:
* **Telemetry & HVAC:** You get a live feed of the bus's speed, solar roof energy production, and power consumption. The driver can manually override the HVAC systems, which actually syncs up with the passenger's UI if they try to mess with their individual AC vents.
* **Event Log:** A running terminal-style log tracks everything from manual engine stops to passengers ordering food or using the AI.
* **The Cleaning Bot:** My personal favorite feature. The staff can deploy a virtual robotic vacuum. You select which zones of the bus to clean (left, right, or aisle), hit start, and watch the bot's progress. It even has a simulated "Lost & Found" feature where it randomly discovers items like wallets or keys while sweeping.

## 🛠️ The Tech Stack

I kept the frontend framework-free to keep things lightweight. 

* **Frontend:** Plain HTML, CSS, and Vanilla JavaScript. It uses Tailwind CSS via CDN for rapid, responsive styling and dark mode support. FontAwesome handles the iconography, and Leaflet takes care of the mapping.
* **Backend:** A simple Node.js server running Express. It serves the static files and handles the heavy lifting for the AI features.
* **AI Integration:** The backend hooks into the `@google/generative-ai` library. It uses the `gemini-2.5-flash` model to process both the text chat and the base64 image strings coming from the AR camera scanner.
* **PWA Magic:** There's a `manifest.json` and a basic service worker (`sw.js`) that caches the core assets, making it installable on mobile devices.

## 🚀 Running it Locally

If you want to spin this up locally to test or modify it, it's pretty straightforward:

1. Clone the repo and navigate into the folder.
2. Run `npm install` to grab the dependencies (Express, Cors, Dotenv, and the Google Gen-AI SDK).
3. Create a `.env` file in the root directory and add your Gemini API key like this:
   `GEMINI_API_KEY=your_key_here`
4. Fire up the server with `node server.js`.
5. Open your browser to `http://localhost:3000`.

*Note: If you want to test the AR camera features locally, you might need to run it over localhost or configure HTTPS depending on your browser's security policies regarding camera access.*
