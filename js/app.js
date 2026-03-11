import { ROUTE_STOPS, CONFIG, DICT } from './data.js';

let leafletMap, mapMarker;

const app = {
    state: {
        lang: 'gr',
        cart: [], activeZones: [], isCleaning: false, currentShop: null,
        busPosition: 0, binLevel: 0, cleaningTimer: null, timeRemaining: 0,
        foundValuables: [], currentFilter: 'all', userRole: 'guest',
        tempProduct: null, driverTemp: 24, roofOpen: false, pinBuffer: "",
        energySaved: 0, pendingPickupStop: null, isStopped: false, manualStop: false, 
        externalTemp: 32, season: 'summer', hvacActive: true, currentSpeed: 50, previousSpeed: 50, baseConsumption: 15,
        isDark: false, 
        
        currentQuizStop: null,
        lastQuizStop: null,
        discountActive: false,
        passengerSeat: null,
        tempSeat: null,
        logs: [],
        cameraStream: null, 
        lastDashcamStop: null
    },

    init: function () {
        const savedPos = localStorage.getItem('cyberbus_pos');
        if (savedPos) this.state.busPosition = parseFloat(savedPos);
        
        try { const savedCart = localStorage.getItem('cyberbus_cart'); if (savedCart) this.state.cart = JSON.parse(savedCart); } catch(e) {}
        try { const savedDiscount = localStorage.getItem('cyberbus_discount'); if (savedDiscount) this.state.discountActive = JSON.parse(savedDiscount); } catch(e) {}
        try { const savedLogs = localStorage.getItem('cyberbus_logs'); if (savedLogs) this.state.logs = JSON.parse(savedLogs); } catch(e) {}
        try { const savedSeat = localStorage.getItem('cyberbus_seat'); if (savedSeat) this.state.passengerSeat = savedSeat; } catch(e) {}

        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) this.toggleTheme();

        if(this.state.logs.length === 0) this.logEvent("SYS_START", "success");
        this.translateUI();
        this.startBusSimulation();
        this.startClock();
        this.updateCartUI(); 
    },

    // --- YOUTUBE IFRAME DASHCAM LOGIC ---
    updateDashcamVideo: function() {
        let nearest = ROUTE_STOPS[0];
        ROUTE_STOPS.forEach(s => { if (Math.abs(s.pct - this.state.busPosition) < 15) nearest = s; });

        if (this.state.lastDashcamStop !== nearest.name) {
            this.state.lastDashcamStop = nearest.name;
            const iframeEl = document.getElementById('dashcam-video');
            if (iframeEl && nearest.videoSrc) {
                // Build YouTube embed URL with autoplay, mute, loop, no controls
                const videoId = nearest.videoSrc;
                iframeEl.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&rel=0&iv_load_policy=3`;
            }
        }
    },

    toggleCameraMode: function(mode) {
        const btnDash = document.getElementById('btn-mode-dashcam');
        const btnAR = document.getElementById('btn-mode-ar');
        const dashContainer = document.getElementById('dashcam-container');
        const arContainer = document.getElementById('ar-camera-container');

        if (mode === 'dashcam') {
            btnDash.classList.replace('bg-slate-800/80', 'bg-red-600');
            btnDash.classList.replace('text-slate-300', 'text-white');
            btnDash.classList.add('animate-pulse', 'ring-2', 'ring-red-400');
            
            btnAR.classList.replace('bg-red-600', 'bg-slate-800/80');
            btnAR.classList.replace('text-white', 'text-slate-300');
            btnAR.classList.remove('animate-pulse', 'ring-2', 'ring-red-400');
            
            arContainer.classList.add('hidden');
            dashContainer.classList.remove('hidden');
            this.stopCamera();
            
            this.state.lastDashcamStop = null; // Force reload
            this.updateDashcamVideo();
        } else {
            btnAR.classList.replace('bg-slate-800/80', 'bg-red-600');
            btnAR.classList.replace('text-slate-300', 'text-white');
            btnAR.classList.add('animate-pulse', 'ring-2', 'ring-red-400');
            
            btnDash.classList.replace('bg-red-600', 'bg-slate-800/80');
            btnDash.classList.replace('text-white', 'text-slate-300');
            btnDash.classList.remove('animate-pulse', 'ring-2', 'ring-red-400');
            
            dashContainer.classList.add('hidden');
            arContainer.classList.remove('hidden');
            
            const dashVideo = document.getElementById('dashcam-video');
            if(dashVideo) dashVideo.src = "about:blank"; // Stop iframe playback
        }
    },

    // --- REAL CAMERA & AR SCANNER ---
    initCamera: async function() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            const videoEl = document.getElementById('live-camera-feed');
            
            videoEl.srcObject = stream;
            videoEl.classList.remove('hidden');
            
            document.getElementById('camera-placeholder').classList.add('hidden');
            document.getElementById('btn-ar-scan').classList.remove('hidden');
            
            this.state.cameraStream = stream;
            this.showToast(this.t("Κάμερα ενεργοποιήθηκε"), "fa-camera", "bg-emerald-600");
        } catch(err) {
            this.showToast(this.t("Σφάλμα κάμερας. Ελέγξτε τις άδειες."), "fa-video-slash", "bg-red-500");
            console.error("Camera Error:", err);
        }
    },

    stopCamera: function() {
        if (this.state.cameraStream) {
            this.state.cameraStream.getTracks().forEach(t => t.stop());
            this.state.cameraStream = null;
            document.getElementById('live-camera-feed').classList.add('hidden');
            document.getElementById('camera-placeholder').classList.remove('hidden');
            document.getElementById('btn-ar-scan').classList.add('hidden');
        }
    },

    startARScan: async function() {
        const btn = document.getElementById('btn-ar-scan');
        const overlay = document.getElementById('ar-scanner-overlay');
        const result = document.getElementById('ar-result-overlay');
        const video = document.getElementById('live-camera-feed');
        const canvas = document.getElementById('ar-canvas');
        
        btn.classList.add('hidden');
        result.classList.add('hidden');
        overlay.classList.remove('hidden');

        // Σμίκρυνση εικόνας για να μην κρασάρει ο server
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / video.videoWidth;
        canvas.width = MAX_WIDTH;
        canvas.height = video.videoHeight * scaleSize;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.6);

        try {
            // Χρησιμοποιούμε ΣΧΕΤΙΚΟ URL αντί για localhost
            const response = await fetch('/api/ar-scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64, lang: this.state.lang })
            });
            
            if (!response.ok) throw new Error("Server rejected request");
            
            const data = await response.json();
            
            overlay.classList.add('hidden');
            result.classList.remove('hidden');

            const titleEl = document.getElementById('ar-title');
            const descEl = document.getElementById('ar-desc');
            const iconEl = document.getElementById('ar-res-icon');

            if (data.status === "OK") {
                titleEl.innerText = data.title;
                titleEl.className = "font-bold mb-1 text-sm text-emerald-300";
                descEl.innerText = data.desc;
                iconEl.className = "fa-solid fa-cube text-3xl text-emerald-400 mb-2 animate-bounce";
            } else {
                titleEl.innerText = this.t("Δεν βρέθηκε αξιοθέατο");
                titleEl.className = "font-bold mb-1 text-sm text-red-300";
                descEl.innerText = this.t("Παρακαλώ δείξτε ένα γνωστό αξιοθέατο.");
                iconEl.className = "fa-solid fa-circle-xmark text-3xl text-red-400 mb-2";
            }
        } catch(e) {
            console.error(e);
            overlay.classList.add('hidden');
            btn.classList.remove('hidden');
            this.showToast("Network/Server error.", "fa-wifi", "bg-red-500");
        }
    },

    closeAR: function() {
        document.getElementById('ar-result-overlay').classList.add('hidden');
        document.getElementById('btn-ar-scan').classList.remove('hidden');
    },

    // --- I18N ---
    toggleLang: function() {
        this.state.lang = this.state.lang === 'gr' ? 'en' : 'gr';
        document.getElementById('lang-btn').innerText = this.state.lang === 'gr' ? '🇬🇷 GR' : '🇬🇧 EN';
        
        this.translateUI();
        this.renderShops();
        this.updateCartUI();
        this.checkLandmarks();
        this.renderLog(); 
        this.driverUtils.updateHVACUI();
        this.updateVacuumControls(this.state.isCleaning);
        
        this.showToast(this.t("Γλώσσα άλλαξε!"), "fa-language", "bg-blue-600");
    },

    t: function(key) {
        if(DICT[key]) { return this.state.lang === 'en' ? DICT[key].en : DICT[key].gr; }
        return key; 
    },

    translateUI: function() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.innerText = this.t(key);
        });
        this.updateRoleDisplay();
    },

    updateRoleDisplay: function() {
        const rd = document.getElementById('user-role-display');
        if(!rd || this.state.userRole === 'guest') return;
        
        if (this.state.userRole === 'driver') rd.innerText = this.t("DRIVER MODE");
        else {
            const seatTxt = this.state.passengerSeat ? ` (Seat ${this.state.passengerSeat})` : "";
            rd.innerText = this.t("PASSENGER") + seatTxt;
        }
    },

    // --- LOGS ---
    logEvent: function(key, type = 'info', dynamicString = null) {
        const time = Date.now();
        const logEntry = dynamicString ? dynamicString : key; 
        
        this.state.logs.unshift({ time, key: logEntry, type, isDynamic: !!dynamicString });
        if (this.state.logs.length > 50) this.state.logs.pop(); 
        
        localStorage.setItem('cyberbus_logs', JSON.stringify(this.state.logs));
        this.renderLog();
    },

    renderLog: function() {
        const box = document.getElementById('driver-log-content');
        if(!box) return;
        
        box.innerHTML = this.state.logs.map(l => {
            const timeStr = new Date(l.time).toLocaleTimeString('el-GR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            let color = 'text-slate-300'; let icon = 'fa-info-circle text-blue-400';
            
            if (l.type === 'error') { color = 'text-red-400'; icon = 'fa-triangle-exclamation text-red-500'; }
            else if (l.type === 'success') { color = 'text-emerald-300'; icon = 'fa-check-circle text-emerald-500'; }
            else if (l.type === 'user') { color = 'text-purple-300'; icon = 'fa-user text-purple-400'; }
            else if (l.type === 'warning') { color = 'text-amber-300'; icon = 'fa-circle-exclamation text-amber-400'; }

            const finalTxt = l.isDynamic ? l.key : this.t(l.key);

            return `<div class="animate-slide ${color} border-b border-white/5 pb-1 mb-1 last:border-0">
                <i class="fa-solid ${icon} mr-1"></i> <span class="opacity-50 text-[9px] mr-1">[${timeStr}]</span> ${finalTxt}
            </div>`;
        }).join('');
    },

    // --- LOGIN & SEAT SELECTION ---
    login: function (role) {
        this.state.userRole = role;
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        this.translateUI();

        if (role === 'driver') {
            document.getElementById('nav-driver').classList.remove('hidden');
            this.switchTab('systems');
            this.driverUtils.updateHVACUI();
            this.renderLog(); 
        } else {
            if(this.state.passengerSeat) this.finalizePassengerLogin();
            else {
                this.renderSeatGrid();
                document.getElementById('seat-modal').classList.remove('hidden');
            }
        }
    },

    renderSeatGrid: function() {
        let html = ''; let seatNum = 1;
        for(let r=0; r<4; r++) {
            for(let c=0; c<5; c++) {
                if(c === 2) html += `<div></div>`; 
                else {
                    html += `<button onclick="app.selectSeat(${seatNum})" id="seat-btn-${seatNum}" class="seat-picker-btn py-3 rounded-lg bg-slate-200 dark:bg-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-blue-200 dark:hover:bg-blue-900 transition">${seatNum}</button>`;
                    seatNum++;
                }
            }
        }
        document.getElementById('seat-grid').innerHTML = html;
    },

    selectSeat: function(num) {
        this.state.tempSeat = num;
        document.querySelectorAll('.seat-picker-btn').forEach(b => {
            b.classList.remove('bg-blue-600', 'text-white', 'ring-4', 'ring-blue-300');
            b.classList.add('bg-slate-200', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300');
        });
        const selected = document.getElementById('seat-btn-' + num);
        selected.classList.remove('bg-slate-200', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300');
        selected.classList.add('bg-blue-600', 'text-white', 'ring-4', 'ring-blue-300');
        document.getElementById('btn-confirm-seat').disabled = false;
    },

    confirmSeat: function() {
        this.state.passengerSeat = this.state.tempSeat;
        localStorage.setItem('cyberbus_seat', this.state.passengerSeat);
        document.getElementById('seat-modal').classList.add('hidden');
        this.finalizePassengerLogin();
    },

    finalizePassengerLogin: function() {
        this.updateRoleDisplay();
        document.getElementById('nav-passenger').classList.remove('hidden');
        this.switchTab('cafe');
        this.renderShops();
        this.updatePassengerACUI();
    },

    // --- AC SYNC ---
    passengerToggleAC: function () {
        this.state.hvacActive = !this.state.hvacActive;
        this.driverUtils.updateHVACUI(); 
        this.updatePassengerACUI(); 
        
        const stateTxt = this.state.hvacActive ? "ON" : "OFF";
        const seat = this.state.passengerSeat || "?";
        const logMsg = this.state.lang === 'en' ? `Passenger (Seat ${seat}) turned ${stateTxt} A/C.` : `Επιβάτης (Θέση ${seat}): Κλιματισμός ${stateTxt}.`;
        
        this.logEvent(null, "user", logMsg);
        this.showToast(this.t('Κλιματισμός') + ' ' + stateTxt, this.state.hvacActive ? 'fa-fan' : 'fa-power-off', this.state.hvacActive ? 'bg-blue-500' : 'bg-slate-500');
    },

    updatePassengerACUI: function() {
        const icon = document.getElementById('p-ac-icon');
        if (icon) {
            if (this.state.hvacActive) icon.classList.add('text-blue-500', 'fa-spin');
            else icon.classList.remove('text-blue-500', 'fa-spin');
        }
    },

    // --- QUIZ ---
    openQuizModal: function() {
        const stopName = this.state.currentQuizStop;
        if (!stopName) return;

        const isEn = this.state.lang === 'en';
        const q = isEn 
            ? { q: "What year were the first modern Olympics held?", opts: ["1896", "1904", "1920"], ans: "1896" }
            : { q: "Ποια χρονιά έγιναν οι πρώτοι σύγχρονοι Ολυμπιακοί;", opts: ["1896", "1904", "1920"], ans: "1896" };
        
        document.getElementById('quiz-sub').innerText = isEn ? "Answer correctly for -10% OFF!" : "Απαντήστε σωστά & κερδίστε -10%!";
        document.getElementById('quiz-question').innerText = q.q;
        
        document.getElementById('quiz-options').innerHTML = q.opts.map(o => 
            `<button onclick="app.checkQuizAns('${o}', '${q.ans}')" class="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-700 dark:text-white font-bold transition">${o}</button>`
        ).join('');
        document.getElementById('quiz-modal').classList.remove('hidden');
    },

    checkQuizAns: function(selected, correct) {
        document.getElementById('quiz-modal').classList.add('hidden');
        const quizBtnContainer = document.getElementById('quiz-trigger-container');
        if(quizBtnContainer) quizBtnContainer.classList.add('hidden');
        
        this.state.lastQuizStop = this.state.currentQuizStop;

        if(selected === correct) {
            this.state.discountActive = true;
            localStorage.setItem('cyberbus_discount', JSON.stringify(true));
            this.updateCartUI(); 
            this.showToast(this.state.lang==='en'?"Correct! -10% Discount applied!":"Σωστά! Κερδίσατε -10% έκπτωση!", "fa-gift", "bg-emerald-600");
        } else {
            this.showToast(this.state.lang==='en'?"Wrong answer!":"Λάθος απάντηση!", "fa-circle-xmark", "bg-red-500");
        }
    },

    // --- CORE METHODS ---
    toggleTheme: function () {
        this.state.isDark = !this.state.isDark;
        document.documentElement.classList.toggle('dark');
        const icon = document.getElementById('theme-icon');
        if(this.state.isDark) icon.classList.replace('fa-moon', 'fa-sun'); 
        else icon.classList.replace('fa-sun', 'fa-moon'); 
    },

    startVoiceRecognition: function() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return this.showToast(this.t("Ο browser δεν υποστηρίζει φωνητική πληκτρολόγηση."), "fa-microphone-slash", "bg-red-500");
        
        const reco = new SpeechRecognition();
        reco.lang = this.state.lang === 'en' ? 'en-US' : 'el-GR'; 
        reco.interimResults = false;
        reco.onstart = () => this.showToast(this.state.lang==='en'?"Listening...":"Ακούω... Μιλήστε τώρα.", "fa-microphone", "bg-purple-600");
        reco.onresult = (e) => { document.getElementById('chat-input').value = e.results[0][0].transcript; this.sendChatMessage(e.results[0][0].transcript); };
        reco.start();
    },

    showHelp: function () { document.getElementById('help-modal').classList.remove('hidden'); },
    showPinPad: function () { document.getElementById('login-main').classList.add('hidden'); document.getElementById('login-pin').classList.remove('hidden'); this.state.pinBuffer = ""; document.getElementById('pin-input').value = ""; },
    hidePinPad: function () { document.getElementById('login-pin').classList.add('hidden'); document.getElementById('login-main').classList.remove('hidden'); },
    addPin: function (num) { if (this.state.pinBuffer.length < 5) { this.state.pinBuffer += num; document.getElementById('pin-input').value = this.state.pinBuffer; } },
    clearPin: function () { this.state.pinBuffer = ""; document.getElementById('pin-input').value = ""; },
    submitPin: function () {
        if (this.state.pinBuffer === "12345") this.login('driver');
        else {
            const inp = document.getElementById('pin-input');
            inp.classList.add('border-red-500', 'animate-shake');
            setTimeout(() => inp.classList.remove('border-red-500', 'animate-shake'), 500);
            this.state.pinBuffer = ""; inp.value = "";
        }
    },

    startClock: function () { setInterval(() => { document.getElementById('live-clock').innerText = new Date().toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }); }, 1000); },

    startBusSimulation: function () {
        setInterval(() => {
            if (this.state.manualStop) { this.state.currentSpeed = 0; this.updateDashboard(); return; }

            if (!this.state.isStopped) {
                const nearestStop = ROUTE_STOPS.find(s => Math.abs(s.pct - this.state.busPosition) < 0.2);
                if (nearestStop && this.state.lastStopTriggered !== nearestStop.name) {
                    this.triggerStopSequence(nearestStop);
                } else {
                    if (this.state.busPosition >= 100) this.state.busPosition = 0;
                    else this.state.busPosition += CONFIG.baseSpeed;
                    if (nearestStop === undefined) this.state.lastStopTriggered = null;
                }
            } else { this.state.currentSpeed = 0; }

            localStorage.setItem('cyberbus_pos', this.state.busPosition);
            this.updateRouteVisuals();
            this.updateDashboard(); 
            if (this.state.userRole === 'passenger') this.updateShopStatuses(); 
            this.checkLandmarks();
            if (this.state.userRole === 'driver') this.checkDriverFatigue();
            
            // DYNAMIC VIDEO UPDATE
            const dashContainer = document.getElementById('dashcam-container');
            if (dashContainer && !dashContainer.classList.contains('hidden') && document.getElementById('view-tour') && !document.getElementById('view-tour').classList.contains('hidden')) {
                this.updateDashcamVideo();
            }

        }, 1000);
    },

    toggleBusStop: function () {
        this.state.manualStop = !this.state.manualStop;
        const btn = document.getElementById('btn-master-stop');
        if (this.state.manualStop) {
            btn.classList.add('bg-red-800');
            this.logEvent("MANUAL_STOP", "error");
        } else {
            btn.classList.remove('bg-red-800');
            this.logEvent("MANUAL_START", "success");
        }
    },

    updateDashboard: function () {
        let limit = 50;
        if (this.state.busPosition < 20 || this.state.busPosition > 80) limit = 30;
        else if (this.state.busPosition > 40 && this.state.busPosition < 60) limit = 60;

        if (!this.state.isStopped && !this.state.manualStop) {
            const variation = Math.floor(Math.random() * 5) - 2;
            this.state.currentSpeed = limit + variation;
            if (this.state.currentSpeed < 0) this.state.currentSpeed = 0;
        }

        const spdDisp = document.getElementById('bus-speed-display');
        if (spdDisp) {
            spdDisp.innerText = this.state.currentSpeed + " km/h";
            if (this.state.currentSpeed === 0) spdDisp.className = "hidden md:block text-xs font-bold bg-red-100 text-red-600 px-2 py-1 rounded animate-pulse";
            else if (this.state.currentSpeed > limit) spdDisp.className = "hidden md:block text-xs font-bold bg-amber-100 text-amber-600 px-2 py-1 rounded animate-pulse border border-amber-200";
            else spdDisp.className = "hidden md:block text-xs font-bold bg-slate-100 dark:bg-slate-700 dark:text-slate-300 text-slate-600 px-2 py-1 rounded";
        }

        const limitEl = document.getElementById('limit-val');
        if (limitEl) {
            limitEl.innerText = limit + " km/h";
            limitEl.className = this.state.currentSpeed > limit ? "font-mono font-bold text-red-600 animate-pulse" : "font-mono font-bold text-slate-700 dark:text-slate-200";
        }

        let consumption = this.state.roofOpen ? 10.0 : 20.0;
        if (this.state.hvacActive) consumption += 5.0;

        const consEl = document.getElementById('pv-cons');
        const pvProdEl = document.getElementById('pv-prod');

        if (this.state.roofOpen && pvProdEl) { pvProdEl.innerText = "22.5 kW"; pvProdEl.className = "text-lg font-mono font-bold text-emerald-400 animate-pulse"; } 
        else if(pvProdEl) { pvProdEl.innerText = "12.4 kW"; pvProdEl.className = "text-lg font-mono font-bold text-emerald-600"; }

        if (consEl) {
            consEl.innerText = consumption.toFixed(1) + " kW";
            consEl.className = consumption < 15 ? "text-lg font-mono font-bold text-emerald-500" : "text-lg font-mono font-bold text-red-400"; 
        }
    },

    triggerStopSequence: function (stop) {
        this.state.lastStopTriggered = stop.name;
        const sName = this.state.lang === 'en' ? stop.en_name : stop.name;
        this.showToast(`${this.t("ΕΠΟΜΕΝΗ ΣΤΑΣΗ")}: ${sName}`, 'fa-door-open', 'bg-blue-600');
        
        const overlay = document.getElementById('stop-overlay');
        if(overlay) overlay.classList.remove('hidden');

        let countdown = 5;
        const stopInterval = setInterval(() => {
            countdown--;
            if (countdown <= 0) {
                clearInterval(stopInterval);
                this.state.isStopped = false;
                if(overlay) overlay.classList.add('hidden');
            }
        }, 1000);
    },

    updateRouteVisuals: function () {
        let currIdx = 0;
        for (let i = 0; i < ROUTE_STOPS.length - 1; i++) {
            if (this.state.busPosition >= ROUTE_STOPS[i].pct) currIdx = i;
        }
        const curr = ROUTE_STOPS[currIdx];
        const next = ROUTE_STOPS[currIdx + 1] || ROUTE_STOPS[0];
        
        const langCurr = this.state.lang === 'en' ? curr.en_name : curr.name;
        const langNext = this.state.lang === 'en' ? next.en_name : next.name;

        const vis = document.getElementById('route-visualizer');
        if(vis) {
            vis.innerHTML = `
                <div class="flex flex-col items-center">
                    <div class="w-3 h-3 bg-blue-600 rounded-full animate-pulse shadow-lg shadow-blue-500"></div>
                    <span class="text-[9px] font-bold text-blue-700 dark:text-blue-400 mt-1">${langCurr}</span>
                </div>
                <div class="flex-1 h-0.5 bg-slate-200 dark:bg-slate-700 mx-2 relative overflow-hidden">
                    <div class="absolute top-0 left-0 h-full bg-blue-400 animate-slide" style="width: 50%"></div>
                </div>
                <div class="flex flex-col items-center opacity-50">
                    <div class="w-2 h-2 bg-slate-400 rounded-full"></div>
                    <span class="text-[9px] mt-1 dark:text-slate-300">${langNext}</span>
                </div>`;
        }
    },

    filterShops: function (cat) {
        this.state.currentFilter = cat;
        document.querySelectorAll('.filter-btn').forEach(b => {
            if (b.innerText.includes(this.t(cat)) || (cat === 'all' && b.innerText.includes(this.t('Όλα')))) b.classList.add('active-filter');
            else b.classList.remove('active-filter');
        });
        this.renderShops();
    },

    renderShops: function () {
        if (document.getElementById('view-cafe').classList.contains('hidden')) return;

        const grid = document.getElementById('shops-grid');
        grid.innerHTML = Array(6).fill(`<div class="skeleton h-32 w-full"></div>`).join('');

        setTimeout(() => {
            const filtered = CONFIG.shops.filter(s => this.state.currentFilter === 'all' || s.cat === this.state.currentFilter);
            grid.innerHTML = filtered.map(shop => {
                const displayName = shop.name;
                const displayCat = this.state.lang === 'en' ? shop.en_cat : shop.cat;
                return `
                <div id="shop-card-${shop.id}" onclick="app.handleShopClick(${shop.id})" class="food-card bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm cursor-pointer group relative overflow-hidden hover:shadow-md transition">
                    <div class="h-24 rounded-xl ${shop.color} flex items-center justify-center mb-3 relative overflow-hidden">
                         <i class="fa-solid ${shop.img} text-4xl opacity-80 group-hover:scale-110 transition duration-500"></i>
                         <div id="shop-badge-${shop.id}"></div>
                    </div>
                    <div class="flex justify-between items-start">
                        <div><h4 class="font-bold text-slate-800 dark:text-white text-lg leading-tight">${displayName}</h4><p class="text-xs text-slate-400 font-medium mt-0.5">${displayCat}</p></div>
                    </div>
                </div>`;
            }).join('');
            this.updateShopStatuses();
        }, 300); 
    },

    updateShopStatuses: function() {
        if (document.getElementById('view-cafe').classList.contains('hidden')) return;
        CONFIG.shops.forEach(shop => {
            const card = document.getElementById(`shop-card-${shop.id}`);
            const badge = document.getElementById(`shop-badge-${shop.id}`);
            if (!card || !badge) return;

            let statusBadge = ""; let isUnavailable = false;
            const busPos = this.state.busPosition;
            const stopPos = shop.deliverTo;

            if (busPos > stopPos + 2) {
                isUnavailable = true;
                statusBadge = `<div class="status-tag absolute bottom-2 right-2 bg-slate-200 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-full">${this.t("UNAVAILABLE")}</div>`;
            } else if (stopPos - busPos < 15) {
                statusBadge = `<div class="status-tag absolute bottom-2 right-2 bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full animate-pulse">${this.t("OPEN")}</div>`;
            } else {
                statusBadge = `<div class="status-tag absolute bottom-2 right-2 bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-1 rounded-full">${this.t("TAKING_ORDERS")}</div>`;
            }

            if (badge.innerHTML !== statusBadge) badge.innerHTML = statusBadge;
            if (isUnavailable && !card.classList.contains('shop-unavailable')) card.classList.add('shop-unavailable');
            else if (!isUnavailable && card.classList.contains('shop-unavailable')) card.classList.remove('shop-unavailable');
        });
    },

    handleShopClick: function(id) {
        const shop = CONFIG.shops.find(s => s.id === id);
        if (this.state.busPosition > shop.deliverTo + 2) this.showToast(this.state.lang==='en'?'Bus passed this stop!':'Το λεωφορείο πέρασε τη στάση!', 'fa-circle-xmark', 'bg-slate-600');
        else this.openShop(id);
    },

    openShop: function (id) {
        const shop = CONFIG.shops.find(s => s.id === id);
        this.state.currentShop = shop;
        document.getElementById('menu-title').innerText = shop.name;
        document.getElementById('menu-subtitle').innerText = this.state.lang === 'en' ? shop.en_cat : shop.cat;

        document.getElementById('menu-items-grid').innerHTML = shop.products.map(p => {
            const prodName = this.state.lang === 'en' && p.n === "Ελληνικός" ? "Greek Coffee" : p.n;
            return `<div class="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex justify-between items-center group hover:border-blue-200 transition">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-slate-400"><i class="fa-solid fa-utensils"></i></div>
                    <div><div class="font-bold text-slate-700 dark:text-white text-sm">${prodName}</div><div class="text-slate-500 text-xs">${p.p.toFixed(2)}€</div></div>
                </div>
                <button onclick="app.prepareProduct('${p.n}', ${p.p})" class="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300 hover:bg-blue-600 hover:text-white transition shadow-sm"><i class="fa-solid fa-plus text-xs"></i></button>
            </div>`
        }).join('');

        document.getElementById('menu-view').classList.remove('translate-x-full', 'hidden');
    },

    closeMenu: function () {
        document.getElementById('menu-view').classList.add('translate-x-full');
        setTimeout(() => document.getElementById('menu-view').classList.add('hidden'), 300);
    },

    prepareProduct: function (n, p) {
        const prod = this.state.currentShop.products.find(x => x.n === n);
        this.state.tempProduct = { ...prod, shopName: this.state.currentShop.name };

        if (prod.opt && prod.opt.length > 0) {
            document.getElementById('pm-title').innerText = prod.n;
            document.getElementById('pm-price').innerText = prod.p.toFixed(2) + '€';
            
            const optMap = { "Σκέτος": "Plain", "Μέτριος": "Medium", "Γλυκός": "Sweet", "Με Γάλα": "With Milk" };
            
            document.getElementById('pm-options').innerHTML = prod.opt.map(o => {
                const optName = this.state.lang === 'en' && optMap[o] ? optMap[o] : o;
                return `<label class="flex items-center space-x-2 p-2 bg-slate-50 dark:bg-slate-700 rounded border border-slate-100 dark:border-slate-600 cursor-pointer hover:border-blue-300"><input type="radio" name="p-opt" value="${o}" class="form-radio text-blue-600"><span class="text-sm text-slate-700 dark:text-white">${optName}</span></label>`
            }).join('');
            document.querySelector('input[name="p-opt"]').checked = true;
            document.getElementById('product-modal').classList.remove('hidden');
        } else {
            this.addToCart(prod.n, prod.p, 1, "-");
        }
    },

    confirmProductAdd: function () {
        const selected = document.querySelector('input[name="p-opt"]:checked').value;
        this.addToCart(this.state.tempProduct.n, this.state.tempProduct.p, 1, selected);
        document.getElementById('product-modal').classList.add('hidden');
    },

    addToCart: function (n, p, qty, variant) {
        const sName = this.state.currentShop.name;
        const ex = this.state.cart.find(i => i.name === n && i.shopName === sName && i.variant === variant);
        if (ex) ex.qty += qty; else this.state.cart.push({ name: n, price: p, shopName: sName, qty: qty, variant: variant });

        localStorage.setItem('cyberbus_cart', JSON.stringify(this.state.cart));

        const icon = document.getElementById('cart-icon');
        icon.classList.add('scale-125'); setTimeout(() => icon.classList.remove('scale-125'), 200);
        this.updateCartUI();
    },

    updateItemQty: function(index, delta) {
        this.state.cart[index].qty += delta;
        if (this.state.cart[index].qty <= 0) this.state.cart.splice(index, 1);
        localStorage.setItem('cyberbus_cart', JSON.stringify(this.state.cart));
        this.updateCartUI();
    },

    updateCartUI: function () {
        const list = document.getElementById('cart-items');
        if (this.state.cart.length === 0) {
            list.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-slate-300 dark:text-slate-500"><i class="fa-solid fa-basket-shopping text-4xl mb-3 opacity-20"></i><span class="text-xs font-medium">${this.t("Το καλάθι είναι άδειο")}</span></div>`;
            document.getElementById('cart-count').innerText = "0";
            document.getElementById('cart-total').innerText = "0.00€";
            
            const dr = document.getElementById('discount-row');
            const ot = document.getElementById('original-total');
            if(dr) dr.classList.add('hidden');
            if(ot) ot.classList.add('hidden');
            return;
        }

        let total = 0, totalItems = 0;
        const optMap = { "Σκέτος": "Plain", "Μέτριος": "Medium", "Γλυκός": "Sweet", "Με Γάλα": "With Milk", "-": "-" };

        list.innerHTML = this.state.cart.map((item, index) => {
            total += item.price * item.qty; totalItems += item.qty;
            const varName = this.state.lang === 'en' && optMap[item.variant] ? optMap[item.variant] : item.variant;
            return `<div class="flex justify-between items-center border-b border-slate-50 dark:border-slate-700 py-2 last:border-0">
                <div>
                    <div class="text-[10px] text-slate-400 font-bold uppercase">${item.shopName}</div>
                    <div class="text-sm font-bold text-slate-700 dark:text-white">${item.name} <span class="text-xs font-normal text-slate-500 dark:text-slate-400">(${varName})</span></div>
                    <div class="text-xs text-blue-600 dark:text-blue-400 font-bold mt-0.5">${(item.price * item.qty).toFixed(2)}€</div>
                </div>
                <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 shrink-0">
                    <button onclick="app.updateItemQty(${index}, -1)" class="w-6 h-6 flex items-center justify-center bg-white dark:bg-slate-600 rounded text-slate-500 dark:text-slate-300 hover:text-red-500 shadow-sm transition"><i class="fa-solid fa-minus text-[10px]"></i></button>
                    <span class="text-xs font-bold text-slate-700 dark:text-white px-1 min-w-[16px] text-center">${item.qty}</span>
                    <button onclick="app.updateItemQty(${index}, 1)" class="w-6 h-6 flex items-center justify-center bg-white dark:bg-slate-600 rounded text-slate-500 dark:text-slate-300 hover:text-blue-500 shadow-sm transition"><i class="fa-solid fa-plus text-[10px]"></i></button>
                </div>
            </div>`;
        }).join('');
        
        document.getElementById('cart-count').innerText = totalItems;
        
        let finalTotal = total;
        const discountRow = document.getElementById('discount-row');
        const origTotalEl = document.getElementById('original-total');
        const cartTotalEl = document.getElementById('cart-total');

        if (this.state.discountActive && total > 0) {
            const discount = total * 0.10;
            finalTotal = total - discount;
            
            if(discountRow) discountRow.classList.remove('hidden');
            if(origTotalEl) { origTotalEl.classList.remove('hidden'); origTotalEl.innerText = total.toFixed(2) + "€"; }
            if(document.getElementById('discount-amount')) document.getElementById('discount-amount').innerText = "-" + discount.toFixed(2) + "€";
        } else {
            if(discountRow) discountRow.classList.add('hidden');
            if(origTotalEl) origTotalEl.classList.add('hidden');
        }

        cartTotalEl.innerText = finalTotal.toFixed(2) + "€";
    },

    initiateCheckout: function () {
        if (this.state.cart.length === 0) return;
        const validStops = ROUTE_STOPS.filter(s => s.pct > this.state.busPosition + 5);
        const list = document.getElementById('pickup-options');
        list.innerHTML = validStops.map(s => {
            const name = this.state.lang === 'en' ? s.en_name : s.name;
            return `<button onclick="app.selectPickup('${name}')" class="w-full text-left px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700 transition flex justify-between items-center group">
                <span class="font-bold text-slate-700 dark:text-white">${name}</span>
                <i class="fa-solid fa-location-dot text-slate-300"></i>
            </button>`
        }).join('');
        document.getElementById('pickup-modal').classList.remove('hidden');
    },

    selectPickup: function (stopName) {
        this.state.pendingPickupStop = stopName;
        document.getElementById('pickup-modal').classList.add('hidden');
        const total = document.getElementById('cart-total').innerText;
        document.getElementById('pay-amount').innerText = total;
        document.getElementById('pay-modal').classList.remove('hidden');
    },

    processPayment: function () {
        document.getElementById('pay-modal').classList.add('hidden');
        this.showToast(this.state.lang==='en'?'Processing...':'Επεξεργασία...', 'fa-circle-notch fa-spin', 'bg-blue-500');

        setTimeout(() => {
            this.state.cart = [];
            this.state.discountActive = false; 
            localStorage.removeItem('cyberbus_cart');
            localStorage.removeItem('cyberbus_discount'); 
            
            this.updateCartUI();
            this.closeMenu();
            this.showToast(this.state.lang==='en'?'Payment Success!':'Επιτυχής Πληρωμή!', 'fa-check-circle', 'bg-emerald-600');
            
            const logMsg = this.state.lang === 'en' 
                ? `Delivery Order (Seat ${this.state.passengerSeat}). Pickup: ${this.state.pendingPickupStop}`
                : `Νέα Παραγγελία (Θέση ${this.state.passengerSeat}). Στάση: ${this.state.pendingPickupStop}`;
            this.logEvent(null, "success", logMsg);

        }, 1500);
    },

    checkLandmarks: function () {
        let nearest = ROUTE_STOPS[0];
        let minDiff = 1000;
        ROUTE_STOPS.forEach(s => {
            const diff = Math.abs(s.pct - this.state.busPosition);
            if (diff < minDiff) { minDiff = diff; nearest = s; }
        });

        const isEn = this.state.lang === 'en';
        const name = isEn ? nearest.en_name : nearest.name;
        const desc = isEn ? nearest.en_desc : nearest.desc;

        const ln = document.getElementById('landmark-name');
        if(ln) ln.innerText = name;
        const ld = document.getElementById('landmark-desc');
        if(ld) ld.innerText = desc;
        
        const wms = document.getElementById('wm-stop-name');
        if(wms) wms.innerText = name;

        const quizBtnContainer = document.getElementById('quiz-trigger-container');
        if (quizBtnContainer) {
            if (nearest.pct > 0 && Math.abs(nearest.pct - this.state.busPosition) < 2 && this.state.lastQuizStop !== name && !this.state.discountActive) {
                quizBtnContainer.classList.remove('hidden');
                this.state.currentQuizStop = name; 
            } else {
                quizBtnContainer.classList.add('hidden');
            }
        }
    },

    speakLandmark: function () {
        const text = document.getElementById('landmark-desc').innerText;
        if (!text) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = this.state.lang === 'en' ? 'en-US' : 'el-GR';
        window.speechSynthesis.speak(utterance);
        this.showToast(this.t("Ανάγνωση"), "fa-volume-high", "bg-blue-500");
    },

    activateWalkingMode: function () {
        document.getElementById('walking-mode-modal').classList.remove('hidden');
        
        let nearest = ROUTE_STOPS[0];
        ROUTE_STOPS.forEach(s => { if (Math.abs(s.pct - this.state.busPosition) < 15) nearest = s; });
        
        const coords = nearest.coords.split(',');
        const lat = parseFloat(coords[0]); const lng = parseFloat(coords[1]);
        const name = this.state.lang === 'en' ? nearest.en_name : nearest.name;

        setTimeout(() => {
            if(!leafletMap) {
                leafletMap = L.map('leaflet-map').setView([lat, lng], 16);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(leafletMap);
                const busIcon = L.divIcon({ html: '<div class="text-3xl animate-bounce">📍</div>', className: 'bg-transparent' });
                mapMarker = L.marker([lat, lng], {icon: busIcon}).addTo(leafletMap).bindPopup(`<b>${name}</b>`);
            } else {
                leafletMap.setView([lat, lng], 16);
                mapMarker.setLatLng([lat, lng]).bindPopup(`<b>${name}</b>`);
            }
            leafletMap.invalidateSize();
        }, 300);

        document.getElementById('wm-stop-name').innerText = name;
        const fText = this.state.lang === 'en' ? "Food Partners (Show ticket for discount)" : "Συνεργάτες Φαγητού (Δείξτε εισιτήριο)";
        const pText = this.state.lang === 'en' ? "Points of Interest" : "Αξιοθέατα (Ιστορικά σημεία)";
        
        document.getElementById('wm-poi-list').innerHTML = `
            <div class="bg-orange-50 dark:bg-orange-900/30 p-3 rounded-xl border border-orange-100 dark:border-orange-800 flex gap-3 items-center">
                <div class="bg-orange-100 dark:bg-orange-800 w-10 h-10 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-200"><i class="fa-solid fa-utensils"></i></div>
                <div><h4 class="font-bold text-slate-800 dark:text-white text-sm">${fText}</h4></div>
            </div>
            <div class="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-xl border border-purple-100 dark:border-purple-800 flex gap-3 items-center">
                <div class="bg-purple-100 dark:bg-purple-800 w-10 h-10 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-200"><i class="fa-solid fa-camera"></i></div>
                <div><h4 class="font-bold text-slate-800 dark:text-white text-sm">${pText}</h4></div>
            </div>
        `;
    },

    closeWalkingMode: function () { document.getElementById('walking-mode-modal').classList.add('hidden'); },

    sendChatMessage: async function (msg = null) {
        const input = document.getElementById('chat-input');
        const text = msg || input.value;
        if (!text) return;

        const history = document.getElementById('chat-history');
        history.innerHTML += `<div class="chat-msg chat-user animate-slide">${text}</div>`;
        input.value = ""; history.scrollTop = history.scrollHeight;

        const loadingId = 'loading-' + Date.now();
        history.innerHTML += `<div id="${loadingId}" class="chat-msg chat-ai"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>`;
        history.scrollTop = history.scrollHeight;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, lang: this.state.lang })
            });
            if (!response.ok) throw new Error('Σφάλμα');
            const data = await response.json();

            document.getElementById(loadingId).remove();
            history.innerHTML += `<div class="chat-msg chat-ai animate-slide"><div class="font-bold text-xs text-purple-600 dark:text-purple-400 mb-1">Gemini AI</div>${data.reply}</div>`;
            history.scrollTop = history.scrollHeight;
            
            const logMsg = this.state.lang === 'en' ? `Seat ${this.state.passengerSeat} used AI.` : `Ο επιβάτης (Θέση ${this.state.passengerSeat}) χρησιμοποίησε το AI.`;
            this.logEvent(null, 'user', logMsg);
        } catch (error) {
            document.getElementById(loadingId).remove();
            history.innerHTML += `<div class="chat-msg chat-ai text-red-500 text-xs">Server Error. Node.js running?</div>`;
        }
    },

    driverUtils: {
        adjustTemp: function (d) {
            app.state.driverTemp += d;
            document.getElementById('target-temp').innerText = app.state.driverTemp + "°C";
        },
        toggleHVAC: function () {
            app.state.hvacActive = !app.state.hvacActive;
            app.driverUtils.updateHVACUI();
            app.updatePassengerACUI();
            app.logEvent(app.state.hvacActive ? "AC_SYS_ON" : "AC_SYS_OFF", "success");
        },
        updateHVACUI: function () {
            const btn = document.getElementById('btn-hvac-power');
            const icon = document.getElementById('fan-icon');
            if(!btn || !icon) return;
            if (app.state.hvacActive) {
                btn.classList.replace('bg-slate-200', 'bg-blue-600'); btn.classList.replace('text-slate-600', 'text-white');
                icon.classList.add('fa-spin'); document.getElementById('hvac-status').innerText = "ON";
            } else {
                btn.classList.replace('bg-blue-600', 'bg-slate-200'); btn.classList.replace('text-white', 'text-slate-600');
                icon.classList.remove('fa-spin'); document.getElementById('hvac-status').innerText = "OFF";
            }
        },
        toggleRoof: function () {
            app.state.roofOpen = !app.state.roofOpen;
            const btn = document.getElementById('btn-roof');
            if (app.state.roofOpen) {
                btn.innerHTML = `<i class="fa-solid fa-arrow-down"></i> <span>${app.t("ΚΛΕΙΣΙΜΟ ΟΡΟΦΗΣ")}</span>`;
                btn.className = "w-full py-3 bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 shadow-emerald-500/50 shadow-lg";
                app.logEvent("ROOF_OPEN", "info");
            } else {
                btn.innerHTML = `<i class="fa-solid fa-arrow-up-from-bracket"></i> <span>${app.t("ΑΝΟΙΓΜΑ ΟΡΟΦΗΣ")}</span>`;
                btn.className = "w-full py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2";
                app.logEvent("ROOF_CLOSE", "info");
            }
        }
    },

    toggleZone: function (id) {
        const el = document.getElementById('zone-' + id);
        const idx = this.state.activeZones.indexOf(id);
        if (idx > -1) { this.state.activeZones.splice(idx, 1); el.classList.remove('zone-active'); } 
        else { this.state.activeZones.push(id); el.classList.add('zone-active'); }
    },

    startCleaning: function () {
        if (this.state.activeZones.length === 0) return this.showToast('Επιλέξτε ζώνη!', 'fa-triangle-exclamation', 'bg-amber-500');
        if (this.state.binLevel >= 100) return this.showToast('Κάδος Γεμάτος!', 'fa-trash', 'bg-red-500');

        let totalTime = 0;
        this.state.activeZones.forEach(z => totalTime += CONFIG.zoneDurations[z]);
        this.state.timeRemaining = totalTime;
        this.state.isCleaning = true;

        this.updateVacuumControls(true);
        document.getElementById('robot-unit').classList.remove('hidden');

        this.moveRobotLoop();
        this.state.cleaningTimer = setInterval(() => this.cleaningTick(), 1000);
        this.logEvent("BOT_START", "info");
    },

    cleaningTick: function () {
        if (!this.state.isCleaning) return;
        this.state.timeRemaining--;
        document.getElementById('timer-text').innerText = `00:${this.state.timeRemaining.toString().padStart(2, '0')}`;

        if (this.state.binLevel < 100) {
            this.state.binLevel += 5; this.updateBinUI();
        } else {
            this.stopCleaning();
            document.getElementById('bin-full-warning').classList.remove('hidden');
            this.logEvent("BOT_FULL", "error");

            setTimeout(() => {
                this.state.binLevel = 0; this.updateBinUI();
                document.getElementById('bin-full-warning').classList.add('hidden');
                this.logEvent("BOT_EMPTY", "success");
            }, 3000);
            return;
        }

        if (this.state.timeRemaining <= 0) {
            this.stopCleaning();
            this.logEvent("BOT_DONE", "success");
        }
    },

    stopCleaning: function () {
        this.state.isCleaning = false;
        clearInterval(this.state.cleaningTimer);
        this.updateVacuumControls(false);
        document.getElementById('robot-unit').classList.add('hidden');
        document.getElementById('timer-text').innerText = "--:--";
    },

    updateVacuumControls: function (active) {
        const btnStart = document.getElementById('btn-start'); const btnStop = document.getElementById('btn-stop'); const txt = document.getElementById('vac-status-text');
        if(!btnStart || !btnStop || !txt) return;
        btnStart.disabled = active; btnStart.classList.toggle('opacity-50', active);
        btnStop.disabled = !active; btnStop.classList.toggle('opacity-50', !active);
        txt.innerText = active ? this.t("Καθαρίζει") : this.t("Αναμονή");
        txt.className = active ? "text-base font-bold text-emerald-600 animate-pulse" : "text-base font-bold text-slate-700 dark:text-white truncate";
    },

    updateBinUI: function () {
        const lvl = this.state.binLevel;
        document.getElementById('bin-bar').style.width = lvl + '%';
        document.getElementById('bin-text').innerText = lvl + '%';
        if (lvl >= 100) document.getElementById('bin-full-warning').classList.remove('hidden');
    },

    manualEmptyBin: function () {
        this.state.binLevel = 0; this.updateBinUI();
        document.getElementById('bin-full-warning').classList.add('hidden');
        this.logEvent("BOT_EMPTY", "user");
    },

    moveRobotLoop: function () {
        if (!this.state.isCleaning) return;
        const r = document.getElementById('robot-unit');
        r.style.top = (Math.random() * 60 + 20) + '%'; r.style.left = (Math.random() * 60 + 20) + '%';
        setTimeout(() => this.moveRobotLoop(), 2000);
    },

    simulateObjectFound: function () {
        const items = ["Πορτοφόλι", "Κινητό", "Γυαλιά Ηλίου", "Κλειδιά"];
        const item = items[Math.floor(Math.random() * items.length)];

        this.state.foundValuables.push({ name: item, time: new Date().toLocaleTimeString('el-GR') });
        const list = document.getElementById('found-items-list');
        document.getElementById('found-badge').innerText = this.state.foundValuables.length;

        list.innerHTML = this.state.foundValuables.map((itm) => `
            <div class="bg-white dark:bg-slate-800 p-2 rounded-lg border border-purple-100 dark:border-purple-800 shadow-sm flex justify-between items-center animate-pop">
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 flex items-center justify-center text-xs"><i class="fa-solid fa-gem"></i></div>
                    <div><div class="text-xs font-bold text-slate-700 dark:text-white">${itm.name}</div><div class="text-[10px] text-slate-400">${itm.time}</div></div>
                </div>
            </div>`).join('');
        this.logEvent("ITEM_FOUND", "warning");
    },

    switchTab: function (t) {
        if (t !== 'tour') this.stopCamera();

        ['view-cafe', 'view-tour', 'view-systems', 'view-vacuum', 'view-ai'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
        });

        const target = document.getElementById('view-' + t);
        target.classList.remove('hidden');
        if (t !== 'systems') target.classList.add('flex'); 

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('tab-' + t);
        if (btn) btn.classList.add('active');
        
        if (t === 'tour') {
            const dashContainer = document.getElementById('dashcam-container');
            if(dashContainer && !dashContainer.classList.contains('hidden')) {
                this.state.lastDashcamStop = null; // Force reload
                this.updateDashcamVideo();
            }
        }
    },

    showToast: function (msg, icon, color) {
        const con = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = `flex items-center gap-3 ${color} text-white px-4 py-3 rounded-lg shadow-xl border border-white/10 text-sm font-medium backdrop-blur-md animate-bounce z-[200]`;
        el.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;
        con.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }
};

window.driver = app.driverUtils;
window.app = app;
window.onload = () => app.init();