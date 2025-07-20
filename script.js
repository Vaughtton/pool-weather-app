class MinimalPoolApp {
    constructor() {
        this.initializeElements();
        this.attachEventListeners();
        this.currentWeatherData = null;
    }

    initializeElements() {
        this.inputSection = document.querySelector('.input-section');
        this.locationInput = document.getElementById('locationInput');
        this.getWeatherBtn = document.getElementById('getWeatherBtn');
        this.getCurrentLocationBtn = document.getElementById('getCurrentLocationBtn');
        this.loading = document.getElementById('loading');
        this.error = document.getElementById('error');
        this.errorMessage = document.getElementById('errorMessage');
        
        this.quickResult = document.getElementById('quickResult');
        this.bestTimeAnswer = document.getElementById('bestTimeAnswer');
        this.quickReason = document.getElementById('quickReason');
        this.quickScore = document.getElementById('quickScore');
        this.scoreExplanation = document.getElementById('scoreExplanation');
        
        this.chartContainer = document.getElementById('chartContainer');
        this.poolChart = document.getElementById('poolChart');
        this.searchAnotherBtn = document.getElementById('searchAnotherBtn');
        this.detailedResults = document.getElementById('detailedResults');
        this.hideDetailsBtn = document.getElementById('hideDetailsBtn');
    }

    attachEventListeners() {
        this.getWeatherBtn.addEventListener('click', () => this.handleGetWeather());
        this.getCurrentLocationBtn.addEventListener('click', () => this.getCurrentLocation());
        this.locationInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleGetWeather();
            }
        });
        
        this.hideDetailsBtn.addEventListener('click', () => this.hideDetails());
        this.searchAnotherBtn.addEventListener('click', () => this.resetToSearch());
    }

    showLoading() {
        this.loading.classList.remove('hidden');
        this.error.classList.add('hidden');
        this.quickResult.classList.add('hidden');
        this.detailedResults.classList.add('hidden');
    }

    hideLoading() {
        this.loading.classList.add('hidden');
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.error.classList.remove('hidden');
        this.loading.classList.add('hidden');
        this.quickResult.classList.add('hidden');
        this.detailedResults.classList.add('hidden');
    }

    showQuickResult() {
        this.inputSection.classList.add('hidden');
        this.quickResult.classList.remove('hidden');
        this.loading.classList.add('hidden');
        this.error.classList.add('hidden');
        this.detailedResults.classList.add('hidden');
    }
    
    resetToSearch() {
        this.inputSection.classList.remove('hidden');
        this.quickResult.classList.add('hidden');
        this.error.classList.add('hidden');
        this.detailedResults.classList.add('hidden');
        this.locationInput.value = '';
        this.locationInput.focus();
    }

    showDetails() {
        this.detailedResults.classList.remove('hidden');
        if (this.currentWeatherData) {
            this.displayDetailedResults(this.currentWeatherData);
        }
    }

    hideDetails() {
        this.detailedResults.classList.add('hidden');
    }

    async getCurrentLocation() {
        if (!navigator.geolocation) {
            this.showError('La geolocalización no es compatible con este navegador.');
            return;
        }

        this.showLoading();

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                await this.fetchWeatherData(lat, lon);
            },
            (error) => {
                this.hideLoading();
                this.showError('No se pudo obtener tu ubicación. Por favor ingresa tu ciudad manualmente.');
            }
        );
    }

    async handleGetWeather() {
        const location = this.locationInput.value.trim();
        if (!location) {
            this.showError('Por favor ingresa el nombre de una ciudad o usa la ubicación actual.');
            return;
        }

        this.showLoading();

        try {
            const coords = await this.geocodeLocation(location);
            await this.fetchWeatherData(coords.lat, coords.lon, location);
        } catch (error) {
            this.showError('Ubicación no encontrada. Por favor intenta con una ciudad diferente.');
        }
    }

    async geocodeLocation(location) {
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`);
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            throw new Error('Ubicación no encontrada');
        }

        return {
            lat: data.results[0].latitude,
            lon: data.results[0].longitude,
            name: data.results[0].name
        };
    }

    async fetchWeatherData(lat, lon, locationName = null) {
        try {
            const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weathercode,windspeed_10m,precipitation_probability,uv_index&current_weather=true&timezone=auto&forecast_days=1`
            );

            if (!response.ok) {
                throw new Error('Datos del clima no disponibles');
            }

            const data = await response.json();
            this.currentWeatherData = { ...data, locationName };
            this.processWeatherData(data, locationName);
        } catch (error) {
            this.showError('No se pudieron obtener los datos del clima. Por favor intenta nuevamente.');
        }
    }

    processWeatherData(data, locationName) {
        const hourly = data.hourly;
        const bestTimes = this.calculateTop4PoolTimes(hourly);
        this.displayQuickResult(bestTimes);
        this.showQuickResult();
    }

    calculateTop4PoolTimes(hourly) {
        const allTimes = [];

        for (let i = 0; i < hourly.time.length; i++) {
            const time = new Date(hourly.time[i]);
            const hour = time.getHours();

            const temp = hourly.temperature_2m[i];
            const windSpeed = hourly.windspeed_10m[i];
            const precipProb = hourly.precipitation_probability[i];
            const uvIndex = hourly.uv_index[i] || 0;
            const weatherCode = hourly.weathercode[i];

            const score = this.calculatePoolScore(temp, windSpeed, precipProb, uvIndex, weatherCode, hour);

            allTimes.push({
                time: time,
                hour: hour,
                temp: temp,
                windSpeed: windSpeed,
                precipProb: precipProb,
                uvIndex: uvIndex,
                weatherCode: weatherCode,
                score: score
            });
        }

        // Sort by score and return all (for chart) but find best among future hours for recommendation
        const now = new Date();
        const currentHour = now.getHours();
        const futureHours = allTimes.filter(t => t.hour >= currentHour);
        const bestFutureTime = futureHours.length > 0 ? futureHours.reduce((a, b) => a.score > b.score ? a : b) : allTimes[0];
        
        // Mark the best time
        allTimes.forEach(t => {
            t.isBest = t.hour === bestFutureTime.hour;
        });
        
        return [bestFutureTime, ...allTimes];
    }

    calculatePoolScore(temp, windSpeed, precipProb, uvIndex, weatherCode, hour) {
        let score = 0;

        // Temperature scoring
        if (temp >= 24 && temp <= 32) {
            score += 40;
        } else if (temp >= 20 && temp <= 35) {
            score += 25;
        } else if (temp >= 18 && temp <= 37) {
            score += 10;
        }

        // Wind scoring
        if (windSpeed <= 10) {
            score += 20;
        } else if (windSpeed <= 20) {
            score += 10;
        }

        // Rain probability scoring
        if (precipProb <= 10) {
            score += 25;
        } else if (precipProb <= 30) {
            score += 15;
        } else if (precipProb <= 50) {
            score += 5;
        }

        // UV index scoring
        if (uvIndex >= 3 && uvIndex <= 7) {
            score += 10;
        } else if (uvIndex >= 1 && uvIndex <= 9) {
            score += 5;
        }

        // Weather condition scoring
        if (weatherCode <= 3) {
            score += 15;
        } else if (weatherCode <= 48) {
            score += 8;
        }

        // Hour penalty for non-pool hours (22:00-07:00)
        if (hour < 7 || hour >= 22) {
            score *= 0.3; // Reduce score by 70% for night/early morning hours
        } else if (hour < 9 || hour >= 20) {
            score *= 0.7; // Moderate reduction for early morning/evening
        }

        return Math.max(0, Math.min(100, score));
    }

    getWeatherDescription(code) {
        const weatherCodes = {
            0: { desc: 'Cielo despejado', icon: '☀️' },
            1: { desc: 'Mayormente despejado', icon: '🌤️' },
            2: { desc: 'Parcialmente nublado', icon: '⛅' },
            3: { desc: 'Nublado', icon: '☁️' },
            45: { desc: 'Neblina', icon: '🌫️' },
            48: { desc: 'Niebla con escarcha', icon: '🌫️' },
            51: { desc: 'Llovizna ligera', icon: '🌦️' },
            53: { desc: 'Llovizna moderada', icon: '🌦️' },
            55: { desc: 'Llovizna intensa', icon: '🌧️' },
            61: { desc: 'Lluvia ligera', icon: '🌦️' },
            63: { desc: 'Lluvia moderada', icon: '🌧️' },
            65: { desc: 'Lluvia intensa', icon: '🌧️' },
            80: { desc: 'Chubascos ligeros', icon: '🌦️' },
            81: { desc: 'Chubascos moderados', icon: '🌧️' },
            82: { desc: 'Chubascos violentos', icon: '⛈️' },
            95: { desc: 'Tormenta', icon: '⛈️' }
        };

        return weatherCodes[code] || { desc: 'Desconocido', icon: '🌡️' };
    }

    displayQuickResult(bestTimes) {
        const bestTime = bestTimes[0];
        const allHourlyTimes = bestTimes.slice(1);

        if (!bestTime) {
            this.bestTimeAnswer.textContent = 'Hoy no es ideal';
            this.quickReason.textContent = 'Las condiciones no son favorables para la piscina';
            this.quickScore.textContent = '0';
            this.quickScore.parentElement.className = 'score-badge score-poor';
            this.scoreExplanation.textContent = 'Condiciones muy desfavorables';
            this.alternativeTimesContainer.innerHTML = '';
            return;
        }

        const weather = this.getWeatherDescription(bestTime.weatherCode);
        const timeString = bestTime.time.toLocaleTimeString('es-ES', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: false 
        });

        this.bestTimeAnswer.textContent = timeString;
        
        let reason = `${weather.icon} ${Math.round(bestTime.temp)}°C`;
        if (bestTime.precipProb <= 20) {
            reason += ' • Sin lluvia';
        }
        if (bestTime.windSpeed <= 15) {
            reason += ' • Poco viento';
        }
        
        this.quickReason.textContent = reason;
        this.quickScore.textContent = bestTime.score;
        
        const scoreElement = this.quickScore.parentElement;
        scoreElement.className = `score-badge ${this.getScoreClass(bestTime.score)}`;
        
        // Set score explanation
        this.scoreExplanation.textContent = this.getScoreExplanation(bestTime);
        
        // Display chart
        this.displayScoreChart(allHourlyTimes, bestTime);
    }

    getScoreClass(score) {
        if (score >= 80) return 'score-excellent';
        if (score >= 60) return 'score-good';
        if (score >= 40) return 'score-fair';
        return 'score-poor';
    }

    getScoreExplanation(bestTime) {
        if (!bestTime) return 'Las estrellas no están alineadas hoy 🌟';
        
        const temp = bestTime.temp;
        const wind = bestTime.windSpeed;
        const rain = bestTime.precipProb;
        const uv = bestTime.uvIndex;
        const score = bestTime.score;
        
        let reasons = [];
        
        // Temperature reasoning
        if (temp >= 24 && temp <= 32) {
            reasons.push('temperatura perfecta para chapuzones');
        } else if (temp >= 20 && temp <= 35) {
            reasons.push(temp < 24 ? 'fresquito pero ideal' : 'calorcito perfecto');
        } else if (temp < 20) {
            reasons.push('un poquito fresco');
        } else {
            reasons.push('hace bastante calor');
        }
        
        // Wind reasoning
        if (wind <= 5) {
            reasons.push('aire calmado como un lago');
        } else if (wind <= 10) {
            reasons.push('brisa suavecita');
        } else if (wind <= 20) {
            reasons.push('un poco de vientecillo');
        } else {
            reasons.push('viento que te despina');
        }
        
        // Rain reasoning  
        if (rain <= 10) {
            reasons.push('cielo despejado garantizado');
        } else if (rain <= 30) {
            reasons.push('muy pocas nubes amenazantes');
        } else if (rain <= 50) {
            reasons.push('puede que llueva un poquito');
        } else {
            reasons.push('las nubes tienen planes sospechosos');
        }
        
        // UV reasoning
        if (uv >= 3 && uv <= 7) {
            reasons.push('sol perfecto para broncearse');
        } else if (uv >= 1 && uv <= 9) {
            reasons.push(uv < 3 ? 'solecito suave' : 'sol intenso, protégete');
        }
        
        // Create catchy message based on score
        let prefix = '';
        if (score >= 85) {
            prefix = '¡Momento dorado! ';
        } else if (score >= 70) {
            prefix = '¡Muy buena opción! ';
        } else if (score >= 55) {
            prefix = 'Buena elección: ';
        } else if (score >= 40) {
            prefix = 'No está mal: ';
        } else if (score >= 25) {
            prefix = 'Podrías intentarlo: ';
        } else {
            prefix = 'Mejor esperemos: ';
        }
        
        // Pick the most relevant reasons (max 3)
        const selectedReasons = reasons.slice(0, 3);
        return prefix + selectedReasons.join(', ') + '.';
    }

    displayScoreChart(allTimes, bestTime) {
        const svg = this.poolChart;
        const chartWidth = 600;
        const chartHeight = 160;
        const margin = { top: 30, right: 30, bottom: 25, left: 30 };
        const width = chartWidth - margin.left - margin.right;
        const height = chartHeight - margin.top - margin.bottom;
        
        // Clear previous chart
        while (svg.children.length > 1) { // Keep the gradient definition
            svg.removeChild(svg.lastChild);
        }
        
        if (!allTimes || allTimes.length === 0) return;
        
        // Create 24-hour data array
        const hourlyData = [];
        for (let hour = 0; hour < 24; hour++) {
            const timeData = allTimes.find(t => t.hour === hour);
            if (timeData) {
                hourlyData.push({
                    hour: hour,
                    score: timeData.score,
                    isBest: bestTime && hour === bestTime.hour
                });
            } else {
                // Fill missing hours with score 0
                hourlyData.push({
                    hour: hour,
                    score: 0,
                    isBest: false
                });
            }
        }
        
        // Calculate scales
        const scaleX = width / 23; // 24 hours, 0-23
        const scaleY = height / 100; // 0-100 score range
        
        // Generate smooth curve path using cubic bezier for extra smoothness
        let pathData = '';
        let areaData = '';
        
        // Calculate control points for smoother curves
        const getControlPoints = (i, points) => {
            const smoothing = 0.2;
            
            if (i === 0 || i === points.length - 1) {
                return { cp1x: points[i].x, cp1y: points[i].y, cp2x: points[i].x, cp2y: points[i].y };
            }
            
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];
            
            const cp1x = curr.x - (next.x - prev.x) * smoothing;
            const cp1y = curr.y - (next.y - prev.y) * smoothing;
            const cp2x = curr.x + (next.x - prev.x) * smoothing;
            const cp2y = curr.y + (next.y - prev.y) * smoothing;
            
            return { cp1x, cp1y, cp2x, cp2y };
        };
        
        // Convert data to points
        const points = hourlyData.map((d, i) => ({
            x: margin.left + (i * scaleX),
            y: margin.top + (height - (d.score * scaleY))
        }));
        
        points.forEach((point, i) => {
            if (i === 0) {
                pathData += `M ${point.x} ${point.y}`;
                areaData += `M ${point.x} ${height + margin.top} L ${point.x} ${point.y}`;
            } else {
                const prevPoint = points[i - 1];
                const cp = getControlPoints(i - 1, points);
                
                pathData += ` C ${cp.cp2x} ${cp.cp2y} ${cp.cp1x} ${cp.cp1y} ${point.x} ${point.y}`;
                areaData += ` C ${cp.cp2x} ${cp.cp2y} ${cp.cp1x} ${cp.cp1y} ${point.x} ${point.y}`;
            }
        });
        
        // Complete area path
        const lastPoint = points[points.length - 1];
        areaData += ` L ${lastPoint.x} ${height + margin.top} Z`;
        
        // Create area (gradient fill)
        const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        area.setAttribute('d', areaData);
        area.setAttribute('class', 'chart-area');
        svg.appendChild(area);
        
        // Create line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('d', pathData);
        line.setAttribute('class', 'chart-line');
        svg.appendChild(line);
        
        // Add interactive elements for each hour
        hourlyData.forEach((d, i) => {
            const x = margin.left + (i * scaleX);
            const y = margin.top + (height - (d.score * scaleY));
            
            // Create hover zone for each hour
            const hoverZone = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            hoverZone.setAttribute('x', x - scaleX/2);
            hoverZone.setAttribute('y', margin.top);
            hoverZone.setAttribute('width', scaleX);
            hoverZone.setAttribute('height', height);
            hoverZone.setAttribute('class', 'hover-zone');
            
            // Create tooltip group
            const tooltipGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            tooltipGroup.setAttribute('class', 'chart-tooltip');
            
            // Tooltip background
            const tooltipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            tooltipRect.setAttribute('x', x - 25);
            tooltipRect.setAttribute('y', y - 30);
            tooltipRect.setAttribute('width', 50);
            tooltipRect.setAttribute('height', 20);
            tooltipRect.setAttribute('class', 'tooltip-rect');
            
            // Tooltip text
            const tooltipText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tooltipText.setAttribute('x', x);
            tooltipText.setAttribute('y', y - 20);
            tooltipText.setAttribute('class', 'tooltip-text');
            tooltipText.textContent = Math.round(d.score);
            
            tooltipGroup.appendChild(tooltipRect);
            tooltipGroup.appendChild(tooltipText);
            
            // Add hover events
            hoverZone.addEventListener('mouseenter', () => {
                tooltipGroup.style.opacity = '1';
            });
            
            hoverZone.addEventListener('mouseleave', () => {
                tooltipGroup.style.opacity = '0';
            });
            
            svg.appendChild(hoverZone);
            svg.appendChild(tooltipGroup);
            
            // Add dot (only for hours with data > 0 or best time)
            if (d.score > 0 || d.isBest) {
                const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                dot.setAttribute('cx', x);
                dot.setAttribute('cy', y);
                dot.setAttribute('class', d.isBest ? 'chart-dot best-time' : 'chart-dot');
                svg.appendChild(dot);
            }
            
            // Add score label for best time (permanent)
            if (d.isBest && d.score > 0) {
                const scoreLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                scoreLabel.setAttribute('x', x);
                scoreLabel.setAttribute('y', y - 15);
                scoreLabel.setAttribute('class', 'chart-label');
                scoreLabel.setAttribute('style', 'font-weight: 600; fill: #00b894;');
                scoreLabel.textContent = Math.round(d.score);
                svg.appendChild(scoreLabel);
            }
            
            // Add hour labels (every 4 hours + best time)
            if (i % 4 === 0 || d.isBest) {
                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', x);
                label.setAttribute('y', height + margin.top + 15);
                label.setAttribute('class', 'chart-label');
                label.textContent = `${d.hour}h`;
                svg.appendChild(label);
            }
        });
        
        // Add horizontal grid lines
        for (let score = 20; score <= 100; score += 20) {
            const y = margin.top + (height - (score * scaleY));
            const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            gridLine.setAttribute('x1', margin.left);
            gridLine.setAttribute('x2', margin.left + width);
            gridLine.setAttribute('y1', y);
            gridLine.setAttribute('y2', y);
            gridLine.setAttribute('class', 'chart-axis');
            gridLine.setAttribute('opacity', '0.3');
            svg.appendChild(gridLine);
        }
    }

    displayDetailedResults(data) {
        const current = data.current_weather;
        const weather = this.getWeatherDescription(current.weathercode);
        
        document.getElementById('currentTemp').textContent = `${Math.round(current.temperature)}°C`;
        document.getElementById('currentCondition').textContent = `${weather.icon} ${weather.desc}`;
        
        this.displayHourlyForecast(data.hourly);
    }

    displayHourlyForecast(hourly) {
        const container = document.getElementById('hourlyContainer');
        container.innerHTML = '';

        const now = new Date();
        const currentHour = now.getHours();

        for (let i = 0; i < Math.min(hourly.time.length, 24); i++) {
            const time = new Date(hourly.time[i]);
            const hour = time.getHours();
            
            if (hour < currentHour) continue;

            const temp = hourly.temperature_2m[i];
            const windSpeed = hourly.windspeed_10m[i];
            const precipProb = hourly.precipitation_probability[i];
            const uvIndex = hourly.uv_index[i] || 0;
            const weatherCode = hourly.weathercode[i];
            
            const score = this.calculatePoolScore(temp, windSpeed, precipProb, uvIndex, weatherCode, hour);
            const weather = this.getWeatherDescription(weatherCode);

            const hourCard = document.createElement('div');
            hourCard.className = `hour-card ${this.getScoreClass(score)}`;
            
            const timeString = time.toLocaleTimeString('es-ES', { 
                hour: 'numeric',
                hour12: false 
            });

            hourCard.innerHTML = `
                <div class="hour-time">${timeString}h</div>
                <div class="hour-icon">${weather.icon}</div>
                <div class="hour-temp">${Math.round(temp)}°C</div>
                <div class="hour-score">${score}</div>
            `;

            container.appendChild(hourCard);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MinimalPoolApp();
});