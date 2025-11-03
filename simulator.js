/* ============================================
   LEAN PRODUCTION LINE SIMULATOR
   JavaScript Logic
   ============================================ */

// ============================================
// CONFIGURATION PRESETS
// ============================================

const PRESETS = {
    'balanced': {
        name: 'Balanced Line',
        wip: 9,
        buffers: [2, 2, 2, 2],
        stations: [
            { dist: 'deterministic', oee: 1.0, mean: 5, batchSize: 1, parallelMachines: 1, variance: 1, min: 2, max: 8, mode: 5 },
            { dist: 'deterministic', oee: 1.0, mean: 5, batchSize: 1, parallelMachines: 1, variance: 1, min: 2, max: 8, mode: 5 },
            { dist: 'deterministic', oee: 1.0, mean: 5, batchSize: 1, parallelMachines: 1, variance: 1, min: 2, max: 8, mode: 5 },
            { dist: 'deterministic', oee: 1.0, mean: 5, batchSize: 1, parallelMachines: 1, variance: 1, min: 2, max: 8, mode: 5 },
            { dist: 'deterministic', oee: 1.0, mean: 5, batchSize: 1, parallelMachines: 1, variance: 1, min: 2, max: 8, mode: 5 },
        ]
    },
    'bottleneck': {
        name: 'Bottleneck (S3)',
        wip: 10,
        buffers: [3, 1, 3, 3],
        stations: [
            { dist: 'uniform', oee: 0.95, mean: 4, batchSize: 1, parallelMachines: 1, variance: 1, min: 3, max: 5, mode: 4 },
            { dist: 'normal', oee: 0.9, mean: 4, batchSize: 1, parallelMachines: 1, variance: 2, min: 2, max: 6, mode: 4 },
            { dist: 'deterministic', oee: 0.8, mean: 8, batchSize: 1, parallelMachines: 1, variance: 1, min: 6, max: 10, mode: 8 },
            { dist: 'uniform', oee: 0.95, mean: 4, batchSize: 1, parallelMachines: 1, variance: 1, min: 3, max: 5, mode: 4 },
            { dist: 'normal', oee: 0.9, mean: 4, batchSize: 1, parallelMachines: 1, variance: 2, min: 2, max: 6, mode: 4 },
        ]
    },
    'high-volatility': {
        name: 'High Volatility',
        wip: 8,
        buffers: [1, 1, 1, 1],
        stations: [
            { dist: 'exponential', oee: 0.85, mean: 6, batchSize: 1, parallelMachines: 1, variance: 1, min: 1, max: 15, mode: 6 },
            { dist: 'triangular', oee: 0.90, mean: 5, batchSize: 1, parallelMachines: 1, variance: 1, min: 1, max: 10, mode: 3 },
            { dist: 'exponential', oee: 0.75, mean: 7, batchSize: 2, parallelMachines: 1, variance: 1, min: 1, max: 20, mode: 7 },
            { dist: 'normal', oee: 0.88, mean: 4, batchSize: 1, parallelMachines: 1, variance: 3, min: 1, max: 10, mode: 4 },
            { dist: 'triangular', oee: 0.92, mean: 5, batchSize: 1, parallelMachines: 1, variance: 1, min: 2, max: 8, mode: 5 },
        ]
    },
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Generate unique colors for pieces
function generatePieceColor(pieceId) {
    let hash = 0;
    for (let i = 0; i < pieceId.length; i++) {
        hash = pieceId.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Use golden ratio for better color distribution
    const golden_ratio = 0.618033988749895;
    const hue = ((hash * golden_ratio) % 1.0) * 360;

    // High saturation and medium lightness for vibrant, distinct colors
    return `hsl(${Math.floor(hue)}, 75%, 55%)`;
}

// ============================================
// PRODUCTION LINE SIMULATOR CLASS
// ============================================

class ProductionLineSimulator {
    constructor() {
        this.stations = [
            { id: 1, dist: 'deterministic', oee: 1.0, batchSize: 1, parallelMachines: 1, machines: [{ piece: null, pieceBatch: [], remainingTime: 0, status: 'free' }], params: { mean: 5, variance: 1, min: 2, max: 8, mode: 5 }, workingTime: 0, processingTime: 0, totalTime: 0 },
            { id: 2, dist: 'deterministic', oee: 1.0, batchSize: 1, parallelMachines: 1, machines: [{ piece: null, pieceBatch: [], remainingTime: 0, status: 'free' }], params: { mean: 4, variance: 1, min: 2, max: 6, mode: 4 }, workingTime: 0, processingTime: 0, totalTime: 0 },
            { id: 3, dist: 'deterministic', oee: 1.0, batchSize: 1, parallelMachines: 1, machines: [{ piece: null, pieceBatch: [], remainingTime: 0, status: 'free' }], params: { mean: 6, variance: 1, min: 3, max: 9, mode: 6 }, workingTime: 0, processingTime: 0, totalTime: 0 },
            { id: 4, dist: 'deterministic', oee: 1.0, batchSize: 1, parallelMachines: 1, machines: [{ piece: null, pieceBatch: [], remainingTime: 0, status: 'free' }], params: { mean: 3, variance: 1, min: 1, max: 5, mode: 3 }, workingTime: 0, processingTime: 0, totalTime: 0 },
            { id: 5, dist: 'deterministic', oee: 1.0, batchSize: 1, parallelMachines: 1, machines: [{ piece: null, pieceBatch: [], remainingTime: 0, status: 'free' }], params: { mean: 5, variance: 1, min: 2, max: 8, mode: 5 }, workingTime: 0, processingTime: 0, totalTime: 0 }
        ];

        this.buffers = [
            { id: 1, capacity: 2, pieces: [], cumulativeFill: 0 },
            { id: 2, capacity: 2, pieces: [], cumulativeFill: 0 },
            { id: 3, capacity: 2, pieces: [], cumulativeFill: 0 },
            { id: 4, capacity: 2, pieces: [], cumulativeFill: 0 },
        ];

        this.wip = 9;
        this.logStep = 5;
        this.zoomWindow = 300;
        this.warmupPeriod = 0;
        this.isRunning = false;
        this.currentTime = 0;
        this.pieceCounter = 0;
        this.completedPieces = 0;
        this.simulationSpeed = 1000;
        this.intervalRef = null;
        this.logHistory = [];
        this.isConverged = false;
        this.milestonePieces = [100, 500, 1000, 5000];
        this.milestoneTimes = [1000, 5000, 10000];

        this.pieceLocations = {}; // Track where each piece is visually
        this.pieceColors = {}; // Track original color of each piece

        this.throughputData = [];
        this.wipData = [];
        this.leadTimeData = [];
        this.completionHistory = [];
        this.pieceTrackingData = {};
        this.completedLeadTimes = [];
        this.fullLog = [];
        this.s1EntriesData = [];
        this.s5ExitsData = [];
        this.userInteractedWithChart = {
            throughputChart: false,
            wipChart: false,
            leadTimeChart: false,
            cumulativeThroughputChart: false,
        };

        this.throughputChart = null;
        this.wipChart = null;
        this.leadTimeChart = null;
        this.leadTimeHistogram = null;
        this.littlesLawChart = null;
        this.cumulativeThroughputChart = null;
        this.ganttChart = null;

        this.ganttWindow = 100;
        this.ganttData = [];

        this.init();
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    init() {
        this.setupEventListeners();
        this.initCharts();
        this.initGanttChart();
        this.updateUI();
        this.updateStationConfigUI();
        this.updateProductionLine();
    }

    // ============================================
    // ANIMATION HELPERS
    // ============================================

    getComponentCenter(id, pieceId = null) {
        const comp = document.getElementById(id);
        const container = document.getElementById('movingPartsContainer');
        if (!comp || !container) return { x: 0, y: 0 };

        const compRect = comp.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        let centerX = compRect.left + compRect.width / 2 - containerRect.left;
        let centerY = compRect.top + compRect.height / 2 - containerRect.top;

        // Handle FIFO stacking in buffers
        if (id.startsWith('buffer') && pieceId) {
            const bufferIndex = parseInt(id.replace('buffer', '')) - 1;
            const buffer = this.buffers[bufferIndex];
            const pieceIndex = buffer.pieces.indexOf(pieceId);

            if (pieceIndex !== -1) {
                // Stack from bottom to top: first piece at bottom (positive offset), last at top (negative offset)
                const stackSpacing = 10;
                const totalPieces = buffer.pieces.length;
                const offsetY = (totalPieces - 1 - pieceIndex) * stackSpacing - ((totalPieces - 1) * stackSpacing / 2);
                centerY += offsetY;
            }
        }

        // Handle vertical arrangement in stations (for batch processing)
        if (id.startsWith('station') && pieceId) {
            const stationIndex = parseInt(id.replace('station', '')) - 1;
            const station = this.stations[stationIndex];

            // First, calculate total pieces in station
            const totalPiecesInStation = station.machines.reduce((sum, m) => sum + m.pieceBatch.length, 0);

            // Then find which position this specific piece is at
            let pieceIndex = -1;
            let accumulatedIndex = 0;

            for (const machine of station.machines) {
                const indexInMachine = machine.pieceBatch.indexOf(pieceId);
                if (indexInMachine !== -1) {
                    pieceIndex = accumulatedIndex + indexInMachine;
                    break;
                }
                accumulatedIndex += machine.pieceBatch.length;
            }

            if (pieceIndex !== -1 && totalPiecesInStation > 1) {
                // Arrange pieces vertically in station
                const stackSpacing = 12;
                const offsetY = (pieceIndex - (totalPiecesInStation - 1) / 2) * stackSpacing;
                centerY += offsetY;
            }
        }

        return { x: centerX, y: centerY };
    }

    // This function is no longer used - pieces keep their unique colors

    createPiece(pieceId, x, y, color) {
        const movingContainer = document.getElementById('movingPartsContainer');
        const piece = document.createElement('div');
        piece.className = 'moving-piece';
        piece.style.backgroundColor = color;
        piece.id = `moving-piece-${pieceId}`;
        piece.style.transform = `translate(${x - 4}px, ${y - 4}px)`;
        piece.style.opacity = '0';
        movingContainer.appendChild(piece);

        // Store original color
        this.pieceColors[pieceId] = color;

        // Fade in
        requestAnimationFrame(() => {
            piece.style.transition = 'opacity 0.3s ease-in';
            piece.style.opacity = '1';
        });

        return piece;
    }

    movePiece(pieceId, destX, destY, duration = 400) {
        const piece = document.getElementById(`moving-piece-${pieceId}`);
        if (!piece) return;

        piece.style.transition = `transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        piece.style.transform = `translate(${destX - 4}px, ${destY - 4}px)`;
    }

    removePiece(pieceId, callback) {
        const piece = document.getElementById(`moving-piece-${pieceId}`);
        if (!piece) {
            if (callback) callback();
            return;
        }

        piece.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        piece.style.opacity = '0';
        piece.style.transform = `${piece.style.transform} scale(0.5)`;

        // Clean up tracking
        delete this.pieceColors[pieceId];

        setTimeout(() => {
            if (piece.parentNode) {
                piece.parentNode.removeChild(piece);
            }
            if (callback) callback();
        }, 300);
    }

    updatePieceColor(pieceId, color) {
        const piece = document.getElementById(`moving-piece-${pieceId}`);
        if (piece) {
            piece.style.backgroundColor = color;
        }
    }

    // ============================================
    // CONFIGURATION MANAGEMENT
    // ============================================

    saveConfiguration() {
        const config = {
            wip: this.wip,
            logStep: this.logStep,
            zoomWindow: this.zoomWindow,
            warmupPeriod: this.warmupPeriod,
            buffers: this.buffers.map(b => ({ capacity: b.capacity })),
            stations: this.stations.map(s => ({
                dist: s.dist,
                oee: s.oee,
                batchSize: s.batchSize,
                parallelMachines: s.parallelMachines,
                params: s.params
            }))
        };

        const json = JSON.stringify(config, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'line_config.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    loadConfiguration(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);
                
                this.resetSimulation();

                this.wip = config.wip || 9;
                this.logStep = config.logStep || 5;
                this.zoomWindow = config.zoomWindow || 300;
                this.warmupPeriod = config.warmupPeriod || 0;

                document.getElementById('wipInput').value = this.wip;
                document.getElementById('logStepInput').value = this.logStep;
                document.getElementById('zoomWindowInput').value = this.zoomWindow;
                document.getElementById('warmupPeriodInput').value = this.warmupPeriod;
                
                if (config.buffers && config.buffers.length === this.buffers.length) {
                    config.buffers.forEach((bConfig, i) => {
                        this.buffers[i].capacity = bConfig.capacity;
                        document.getElementById(`buffer${i+1}Capacity`).value = bConfig.capacity;
                    });
                }
                
                if (config.stations && config.stations.length === this.stations.length) {
                    config.stations.forEach((sConfig, i) => {
                        const station = this.stations[i];
                        
                        station.dist = sConfig.dist;
                        station.oee = sConfig.oee;
                        station.batchSize = sConfig.batchSize || 1;
                        station.parallelMachines = sConfig.parallelMachines || 1;
                        station.params = { ...station.params, ...sConfig.params };

                        station.machines = [];
                        for (let j = 0; j < station.parallelMachines; j++) {
                            station.machines.push({
                                piece: null,
                                pieceBatch: [],
                                remainingTime: 0,
                                status: 'free'
                            });
                        }

                        document.getElementById(`station${i+1}Dist`).value = sConfig.dist;
                        document.getElementById(`station${i+1}OEE`).value = sConfig.oee.toFixed(2);
                        document.getElementById(`station${i+1}Batch`).value = station.batchSize;
                        document.getElementById(`station${i+1}Parallel`).value = station.parallelMachines;
                        document.getElementById(`station${i+1}Mean`).value = sConfig.params.mean;
                        document.getElementById(`station${i+1}Variance`).value = sConfig.params.variance;
                        document.getElementById(`station${i+1}Min`).value = sConfig.params.min;
                        document.getElementById(`station${i+1}Max`).value = sConfig.params.max;
                        document.getElementById(`station${i+1}Mode`).value = sConfig.params.mode;

                        document.getElementById(`station${i+1}Dist`).dispatchEvent(new Event('change'));
                    });
                }

                this.updateStationConfigUI();
                this.updateProductionLine();
                this.updateUI();
                console.log("Configuration loaded successfully.");
            } catch (error) {
                console.error("Error loading configuration:", error);
            }
        };
        reader.readAsText(file);
    }

    // ============================================
    // LOCAL STORAGE MANAGEMENT
    // ============================================

    getConfigurationObject() {
        return {
            wip: this.wip,
            logStep: this.logStep,
            zoomWindow: this.zoomWindow,
            warmupPeriod: this.warmupPeriod,
            buffers: this.buffers.map(b => ({ capacity: b.capacity })),
            stations: this.stations.map(s => ({
                dist: s.dist,
                oee: s.oee,
                batchSize: s.batchSize,
                parallelMachines: s.parallelMachines,
                params: s.params
            }))
        };
    }

    saveToLocalStorage(name) {
        try {
            const config = this.getConfigurationObject();
            const savedConfigs = this.getSavedConfigurations();

            savedConfigs[name] = {
                config: config,
                timestamp: new Date().toISOString(),
                name: name
            };

            localStorage.setItem('omlp_saved_configs', JSON.stringify(savedConfigs));
            console.log(`✅ Configuration "${name}" saved to localStorage`);
            return true;
        } catch (error) {
            console.error('Error saving to localStorage:', error);
            return false;
        }
    }

    getSavedConfigurations() {
        try {
            const saved = localStorage.getItem('omlp_saved_configs');
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return {};
        }
    }

    loadFromLocalStorage(name) {
        try {
            const savedConfigs = this.getSavedConfigurations();
            const savedConfig = savedConfigs[name];

            if (!savedConfig) {
                console.error(`Configuration "${name}" not found`);
                return false;
            }

            this.applyConfigurationObject(savedConfig.config);
            console.log(`✅ Configuration "${name}" loaded from localStorage`);
            return true;
        } catch (error) {
            console.error('Error loading from localStorage:', error);
            return false;
        }
    }

    deleteFromLocalStorage(name) {
        try {
            const savedConfigs = this.getSavedConfigurations();
            delete savedConfigs[name];
            localStorage.setItem('omlp_saved_configs', JSON.stringify(savedConfigs));
            console.log(`✅ Configuration "${name}" deleted from localStorage`);
            return true;
        } catch (error) {
            console.error('Error deleting from localStorage:', error);
            return false;
        }
    }

    applyConfigurationObject(config) {
        this.resetSimulation();

        this.wip = config.wip || 9;
        this.logStep = config.logStep || 5;
        this.zoomWindow = config.zoomWindow || 300;
        this.warmupPeriod = config.warmupPeriod || 0;

        document.getElementById('wipInput').value = this.wip;
        document.getElementById('logStepInput').value = this.logStep;
        document.getElementById('zoomWindowInput').value = this.zoomWindow;
        document.getElementById('warmupPeriodInput').value = this.warmupPeriod;

        if (config.buffers && config.buffers.length === this.buffers.length) {
            config.buffers.forEach((bConfig, i) => {
                this.buffers[i].capacity = bConfig.capacity;
                document.getElementById(`buffer${i+1}Capacity`).value = bConfig.capacity;
            });
        }

        if (config.stations && config.stations.length === this.stations.length) {
            config.stations.forEach((sConfig, i) => {
                const station = this.stations[i];

                station.dist = sConfig.dist;
                station.oee = sConfig.oee;
                station.batchSize = sConfig.batchSize || 1;
                station.parallelMachines = sConfig.parallelMachines || 1;
                station.params = { ...station.params, ...sConfig.params };

                station.machines = [];
                for (let j = 0; j < station.parallelMachines; j++) {
                    station.machines.push({
                        piece: null,
                        pieceBatch: [],
                        remainingTime: 0,
                        status: 'free'
                    });
                }

                document.getElementById(`station${i+1}Dist`).value = sConfig.dist;
                document.getElementById(`station${i+1}OEE`).value = sConfig.oee.toFixed(2);
                document.getElementById(`station${i+1}Batch`).value = station.batchSize;
                document.getElementById(`station${i+1}Parallel`).value = station.parallelMachines;
                document.getElementById(`station${i+1}Mean`).value = sConfig.params.mean;
                document.getElementById(`station${i+1}Variance`).value = sConfig.params.variance;
                document.getElementById(`station${i+1}Min`).value = sConfig.params.min;
                document.getElementById(`station${i+1}Max`).value = sConfig.params.max;
                document.getElementById(`station${i+1}Mode`).value = sConfig.params.mode;
            });
        }

        this.updateVisuals();
    }

    autoSave() {
        this.saveToLocalStorage('__autosave__');
    }

    loadAutoSave() {
        const savedConfigs = this.getSavedConfigurations();
        if (savedConfigs['__autosave__']) {
            this.loadFromLocalStorage('__autosave__');
            console.log('✅ Auto-saved configuration restored');
        }
    }

    applyPreset(presetKey) {
        this.resetSimulation();
        const preset = PRESETS[presetKey];

        this.wip = preset.wip;
        document.getElementById('wipInput').value = this.wip;
        this.warmupPeriod = 0;
        document.getElementById('warmupPeriodInput').value = this.warmupPeriod;

        preset.buffers.forEach((capacity, i) => {
            this.buffers[i].capacity = capacity;
            document.getElementById(`buffer${i+1}Capacity`).value = capacity;
        });

        preset.stations.forEach((sConfig, i) => {
            const station = this.stations[i];
            
            station.dist = sConfig.dist;
            station.oee = sConfig.oee;
            station.batchSize = sConfig.batchSize;
            station.parallelMachines = sConfig.parallelMachines || 1;
            station.params.mean = sConfig.mean;
            station.params.variance = sConfig.variance;
            station.params.min = sConfig.params?.min || 1;
            station.params.max = sConfig.params?.max || 120;
            station.params.mode = sConfig.params?.mode || 1;

            station.machines = [];
            for (let j = 0; j < station.parallelMachines; j++) {
                station.machines.push({
                    piece: null,
                    pieceBatch: [],
                    remainingTime: 0,
                    status: 'free'
                });
            }

            document.getElementById(`station${i+1}Dist`).value = sConfig.dist;
            document.getElementById(`station${i+1}OEE`).value = sConfig.oee.toFixed(2);
            document.getElementById(`station${i+1}Batch`).value = sConfig.batchSize;
            document.getElementById(`station${i+1}Parallel`).value = station.parallelMachines;
            document.getElementById(`station${i+1}Mean`).value = sConfig.mean;
            document.getElementById(`station${i+1}Variance`).value = station.params.variance;
            document.getElementById(`station${i+1}Min`).value = station.params.min;
            document.getElementById(`station${i+1}Max`).value = station.params.max;
            document.getElementById(`station${i+1}Mode`).value = station.params.mode;

            document.getElementById(`station${i+1}Dist`).dispatchEvent(new Event('change'));
        });

        this.updateStationConfigUI();
        this.updateProductionLine();
        this.updateUI();
        
        console.log(`Preset "${preset.name}" loaded successfully.`);
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    setupEventListeners() {
        document.getElementById('startBtn').addEventListener('click', () => this.startSimulation());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pauseSimulation());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetSimulation());
        
        document.getElementById('speedRange').addEventListener('input', (e) => {
            const sliderValue = parseInt(e.target.value);
            const speedMultiplier = sliderValue / 10.0;
            this.simulationSpeed = 1000 / speedMultiplier;
            document.getElementById('speedDisplay').textContent = speedMultiplier.toFixed(1) + 'x';
            if (this.isRunning) {
                clearInterval(this.intervalRef);
                this.intervalRef = setInterval(() => this.step(), this.simulationSpeed);
            }
        });
        
        document.getElementById('stepBtn').addEventListener('click', () => {
            this.pauseSimulation();
            this.step();
        });

        document.querySelectorAll('.preset-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const presetKey = e.target.dataset.preset;
                if (presetKey) {
                    this.applyPreset(presetKey);
                }
            });
        });

        document.getElementById('wipInput').addEventListener('change', (e) => {
            this.wip = parseInt(e.target.value);
            this.updateUI();
        });
        
        document.getElementById('warmupPeriodInput').addEventListener('change', (e) => {
            this.warmupPeriod = parseInt(e.target.value) || 0;
            this.updateUI();
        });

        document.getElementById('zoomWindowInput').addEventListener('change', (e) => {
            this.zoomWindow = parseInt(e.target.value) || 300;
        });

        for (let i = 1; i <= 5; i++) {
            const station = this.stations[i - 1];
            const distSelect = document.getElementById(`station${i}Dist`);
            const paramsContainer = document.getElementById(`station${i}Params`);
            const oeeInput = document.getElementById(`station${i}OEE`);
            const batchInput = document.getElementById(`station${i}Batch`);
            const parallelInput = document.getElementById(`station${i}Parallel`);

            parallelInput.addEventListener('change', (e) => {
                let value = parseInt(e.target.value) || 1;
                value = Math.max(1, Math.min(10, value));
                e.target.value = value;
                station.parallelMachines = value;
                
                station.machines = [];
                for (let j = 0; j < value; j++) {
                    station.machines.push({
                        piece: null,
                        pieceBatch: [],
                        remainingTime: 0,
                        status: 'free'
                    });
                }
                this.updateStationConfigUI();
                this.updateProductionLine();
            });

            batchInput.addEventListener('change', (e) => {
                let value = parseInt(e.target.value) || 1;
                value = Math.max(1, value);
                e.target.value = value;
                station.batchSize = value;
                this.updateStationConfigUI();
            });

            oeeInput.addEventListener('change', (e) => {
                let value = parseFloat(e.target.value);
                value = Math.min(1.0, Math.max(0.01, value));
                e.target.value = value.toFixed(2);
                station.oee = value;
                this.updateStationConfigUI();
            });

            distSelect.addEventListener('change', (e) => {
                const newDist = e.target.value;
                const oldDist = station.dist;
                
                if (newDist !== oldDist) {
                    const currentMean = station.params.mean;
                    if (newDist === 'triangular') {
                        const newMode = currentMean;
                        const newMin = Math.max(1, Math.round(newMode * 0.5));
                        const newMax = Math.round(newMode * 1.5);
                        station.params.min = newMin;
                        station.params.max = newMax;
                        station.params.mode = newMode;
                        document.getElementById(`station${i}Min`).value = newMin;
                        document.getElementById(`station${i}Max`).value = newMax;
                        document.getElementById(`station${i}Mode`).value = newMode;
                    } else if (newDist === 'uniform') {
                        const newMin = Math.max(1, Math.round(currentMean * 0.75));
                        const newMax = Math.round(currentMean * 1.25);
                        station.params.min = newMin;
                        station.params.max = newMax;
                        document.getElementById(`station${i}Min`).value = newMin;
                        document.getElementById(`station${i}Max`).value = newMax;
                    }
                }

                station.dist = newDist;
                
                paramsContainer.querySelectorAll('.param-group').forEach(group => {
                    const dists = group.dataset.dist.split(' ');
                    if (dists.includes(newDist)) {
                        group.classList.remove('hidden');
                    } else {
                        group.classList.add('hidden');
                    }
                });
                this.updateStationConfigUI();
            });

            document.getElementById(`station${i}Mean`).addEventListener('change', (e) => {
                station.params.mean = parseFloat(e.target.value);
                this.updateStationConfigUI();
            });
            document.getElementById(`station${i}Variance`).addEventListener('change', (e) => station.params.variance = parseFloat(e.target.value));
            document.getElementById(`station${i}Min`).addEventListener('change', (e) => station.params.min = parseFloat(e.target.value));
            document.getElementById(`station${i}Max`).addEventListener('change', (e) => station.params.max = parseFloat(e.target.value));
            document.getElementById(`station${i}Mode`).addEventListener('change', (e) => station.params.mode = parseFloat(e.target.value));

            distSelect.dispatchEvent(new Event('change'));
        }

        for (let i = 1; i <= 4; i++) {
            const input = document.getElementById(`buffer${i}Capacity`);
            input.addEventListener('change', (e) => {
                this.buffers[i - 1].capacity = parseInt(e.target.value);
                this.updateProductionLine();
                this.updateUI();
            });
        }
        
        document.getElementById('exportLogBtn').addEventListener('click', () => this.exportLogToCSV());
        document.getElementById('saveConfigBtn').addEventListener('click', () => this.saveConfiguration());
        
        document.getElementById('loadConfigBtn').addEventListener('click', () => {
            document.getElementById('configFileInput').click();
        });
        document.getElementById('configFileInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadConfiguration(file);
            }
        });
        
        document.querySelectorAll('.zoom-recent-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const chartId = e.target.dataset.chart;
                if (this[chartId]) {
                    this.userInteractedWithChart[chartId] = false;
                    this.zoomToRecent(this[chartId], true);
                    this[chartId].update();
                }
            });
        });

        document.querySelectorAll('.zoom-all-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const chartId = e.target.dataset.chart;
                if (this[chartId]) {
                    this.userInteractedWithChart[chartId] = true;
                    const chart = this[chartId];
                    delete chart.options.scales.x.min;
                    delete chart.options.scales.x.max;
                    delete chart.options.scales.y.min;
                    delete chart.options.scales.y.max;
                    chart.update();
                }
            });
        });

        document.getElementById('ganttWindowInput').addEventListener('change', (e) => {
            this.ganttWindow = parseInt(e.target.value) || 100;
            if (this.ganttData.length > 0) {
                this.updateGanttChart();
            }
        });
    }

    // ============================================
    // CHARTS INITIALIZATION
    // ============================================

    initCharts() {
        const createChartOptions = (yLabel, chartId) => ({
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: yLabel }
                },
                x: {
                    title: { display: true, text: 'Time (sec)' }
                }
            },
            plugins: {
                legend: { display: false },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        onPanStart: ({chart}) => { this.userInteractedWithChart[chart.canvas.id] = true; return true; },
                    },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                        onZoomStart: ({chart}) => { this.userInteractedWithChart[chart.canvas.id] = true; return true; },
                    }
                }
            }
        });

        this.throughputChart = new Chart(document.getElementById('throughputChart').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Parts/Hour', data: [], borderColor: 'rgb(168, 75, 47)', backgroundColor: 'rgba(168, 75, 47, 0.1)', tension: 0.1, fill: true }] },
            options: createChartOptions('Parts/Hour', 'throughputChart')
        });

        this.wipChart = new Chart(document.getElementById('wipChart').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'WIP Level', data: [], borderColor: 'rgb(98, 108, 113)', backgroundColor: 'rgba(98, 108, 113, 0.1)', tension: 0.1, fill: true }] },
            options: createChartOptions('WIP Level', 'wipChart')
        });

        this.leadTimeChart = new Chart(document.getElementById('leadTimeChart').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Lead Time (seconds)', data: [], borderColor: 'rgb(50, 184, 198)', backgroundColor: 'rgba(50, 184, 198, 0.1)', tension: 0.1, fill: true }] },
            options: createChartOptions('Lead Time (seconds)', 'leadTimeChart')
        });

        this.leadTimeHistogram = new Chart(document.getElementById('leadTimeHistogram').getContext('2d'), {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Frequency', data: [], backgroundColor: 'rgba(168, 75, 47, 0.6)', borderColor: 'rgb(168, 75, 47)', borderWidth: 1 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Frequency' } },
                    x: { title: { display: true, text: 'Lead Time (seconds)' } }
                },
                plugins: { legend: { display: false } }
            }
        });

        this.littlesLawChart = new Chart(document.getElementById('littlesLawChart').getContext('2d'), {
            type: 'scatter',
            data: { datasets: [{ label: 'WIP vs Throughput', data: [], backgroundColor: 'rgba(33, 128, 141, 0.6)', borderColor: 'rgb(33, 128, 141)', pointRadius: 4 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Throughput (Parts/Hour)' } },
                    x: { beginAtZero: true, title: { display: true, text: 'WIP Level' } }
                },
                plugins: { legend: { display: true } }
            }
        });

        this.cumulativeThroughputChart = new Chart(document.getElementById('cumulativeThroughputChart').getContext('2d'), {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'S1 Entries (Cumulative)',
                        data: [],
                        borderColor: 'rgb(59, 130, 246)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        stepped: true,
                        fill: false,
                        borderWidth: 2
                    },
                    {
                        label: 'S5 Exits (Cumulative)',
                        data: [],
                        borderColor: 'rgb(239, 68, 68)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        stepped: true,
                        fill: false,
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Cumulative Parts'
                        }
                    },
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Time (sec)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true
                    }
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        onPanStart: (chart) => {
                            this.userInteractedWithChart[chart.canvas.id] = true;
                            return true;
                        }
                    },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                        onZoomStart: (chart) => {
                            this.userInteractedWithChart[chart.canvas.id] = true;
                            return true;
                        }
                    }
                }
            }
        });
    }

    initGanttChart() {
        const canvas = document.getElementById('ganttChart');
        if (!canvas) return;

        const container = canvas.parentElement;
        canvas.width = container.offsetWidth - 24;
        canvas.height = 400;

        const ctx = canvas.getContext('2d');
        this.ganttChart = { canvas, ctx };
    }

    // ============================================
    // SIMULATION CONTROL
    // ============================================

    startSimulation() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.intervalRef = setInterval(() => this.step(), this.simulationSpeed);
            document.getElementById('startBtn').disabled = true;
            document.getElementById('pauseBtn').disabled = false;
        }
    }

    pauseSimulation() {
        if (this.isRunning) {
            this.isRunning = false;
            clearInterval(this.intervalRef);
            document.getElementById('startBtn').disabled = false;
            document.getElementById('pauseBtn').disabled = true;
        }
    }

    resetSimulation() {
        this.pauseSimulation();

        this.stations.forEach(station => {
            station.machines = [];
            for (let i = 0; i < station.parallelMachines; i++) {
                station.machines.push({
                    piece: null,
                    pieceBatch: [],
                    remainingTime: 0,
                    status: 'free'
                });
            }
            station.workingTime = 0;
            station.processingTime = 0;
            station.totalTime = 0;
        });
        
        this.buffers.forEach(buffer => {
            buffer.pieces = [];
            buffer.cumulativeFill = 0;
        });

        this.currentTime = 0;
        this.pieceCounter = 0;
        this.completedPieces = 0;
        this.logStep = 5;
        this.zoomWindow = 300;
        this.warmupPeriod = 0;
        document.getElementById('warmupPeriodInput').value = 0;

        this.isConverged = false;
        document.getElementById('convergenceIndicator').style.display = 'none';

        this.pieceLocations = {};
        this.pieceColors = {};
        const movingContainer = document.getElementById('movingPartsContainer');
        if (movingContainer) movingContainer.innerHTML = '';

        this.throughputData = [];
        this.wipData = [];
        this.leadTimeData = [];
        this.completionHistory = [];
        this.pieceTrackingData = {};
        this.completedLeadTimes = [];
        this.fullLog = [];
        this.s1EntriesData = [];
        this.s5ExitsData = [];
        this.userInteractedWithChart = { throughputChart: false, wipChart: false, leadTimeChart: false, cumulativeThroughputChart: false };

        [this.throughputChart, this.wipChart, this.leadTimeChart].forEach(chart => {
            chart.data.labels = [];
            chart.data.datasets[0].data = [];
            this.zoomToRecent(chart, true);
            chart.update();
        });

        this.cumulativeThroughputChart.data.datasets[0].data = [];
        this.cumulativeThroughputChart.data.datasets[1].data = [];
        // Auto-zoom integrato nella funzione update
        this.cumulativeThroughputChart.update();

        this.updateUI();
        this.updateProductionLine();

        document.getElementById('startBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
    }

    // ============================================
    // PROCESSING TIME CALCULATION
    // ============================================

    getProcessingTime(station) {
        const { dist, params, oee } = station;
        const { mean, variance, min, max, mode } = params;
        
        let baseTime;
        const effectiveOEE = Math.max(0.01, oee);

        switch (dist) {
            case 'normal': {
                let u = 0, v = 0;
                while (u === 0) u = Math.random();
                while (v === 0) v = Math.random();
                let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
                const stdDev = Math.sqrt(variance);
                baseTime = mean + z * stdDev;
                break;
            }
            case 'exponential':
                baseTime = -mean * Math.log(1 - Math.random());
                break;
            case 'uniform':
                baseTime = Math.random() * (max - min) + min;
                break;
            case 'triangular': {
                const F = (mode - min) / (max - min);
                const U = Math.random();
                if (U < F) {
                    baseTime = min + Math.sqrt(U * (max - min) * (mode - min));
                } else {
                    baseTime = max - Math.sqrt((1 - U) * (max - min) * (max - mode));
                }
                break;
            }
            case 'deterministic':
            default:
                baseTime = mean;
        }

        let effectiveTime = Math.round(baseTime / effectiveOEE);
        return Math.max(1, effectiveTime);
    }

    // ============================================
    // SIMULATION STEP
    // ============================================

    step() {
        const previousCompletedPieces = this.completedPieces;
        this.currentTime++;

        this.recordGanttData();

        this.stations.forEach(station => {
            station.totalTime++;
            let anyMachineWorking = false;
            let anyMachineProcessing = false;

            station.machines.forEach(machine => {
                if (machine.piece) {
                    anyMachineWorking = true;
                    if (machine.remainingTime > 0) {
                        machine.remainingTime--;
                        anyMachineProcessing = true;
                    }
                }
            });

            if (anyMachineWorking) station.workingTime++;
            if (anyMachineProcessing) station.processingTime++;
        });
    
        this.stations.forEach((station, stationIndex) => {
            const isLastStation = stationIndex === this.stations.length - 1;
            const downstreamBuffer = isLastStation ? null : this.buffers[stationIndex];
            
            station.machines.forEach((machine, machineIndex) => {
                if (machine.piece && machine.remainingTime === 0) {
                    machine.status = 'blocked';
                    const batch = machine.pieceBatch;
                    const batchSize = station.batchSize;
                    
                    const sourceId = `station${station.id}`;
            
                    if (isLastStation) {
                        const destId = 'outputBox';
                        const destCenter = this.getComponentCenter(destId);

                        batch.forEach(pieceId => {
                            const leadTime = this.currentTime - this.pieceTrackingData[pieceId].startTime;
                            if (this.currentTime > this.warmupPeriod) {
                                this.completedLeadTimes.push(leadTime);
                            }
                            this.completionHistory.push({ time: this.currentTime, completed: this.completedPieces + 1, leadTime: leadTime });
                            delete this.pieceTrackingData[pieceId];
                            this.completedPieces++;

                            // Move to output and then remove
                            this.movePiece(pieceId, destCenter.x, destCenter.y, 400);
                            setTimeout(() => this.removePiece(pieceId), 400);
                            delete this.pieceLocations[pieceId];
                        });

                        // Track S5 exits for cumulative throughput chart
                        this.s5ExitsData.push({ time: this.currentTime, count: batch.length });

                        machine.piece = null;
                        machine.pieceBatch = [];
                        machine.status = 'free';
                    } else {
                        const destId = `buffer${downstreamBuffer.id}`;
                        const destCenter = this.getComponentCenter(destId);

                        if (downstreamBuffer.capacity >= batchSize && (downstreamBuffer.pieces.length + batchSize <= downstreamBuffer.capacity)) {
                            batch.forEach((pieceId, index) => {
                                downstreamBuffer.pieces.push(pieceId);

                                // Get position with FIFO stacking after adding to buffer
                                setTimeout(() => {
                                    const finalPos = this.getComponentCenter(destId, pieceId);
                                    this.movePiece(pieceId, finalPos.x, finalPos.y, 400);
                                    // Keep original color in buffer
                                }, index * 50);

                                this.pieceLocations[pieceId] = destId;
                            });

                            machine.piece = null;
                            machine.pieceBatch = [];
                            machine.status = 'free';
                        }
                    }
                }
            });
        });
    
        this.stations.forEach((station, stationIndex) => {
            const isFirstStation = stationIndex === 0;
            const batchSize = station.batchSize;
            const destId = `station${station.id}`;
            
            station.machines.forEach((machine, machineIndex) => {
                if (machine.status === 'free') {
                    if (isFirstStation) {
                        const availableQueue = Math.max(0, this.wip - this.getTotalWIP());

                        if (availableQueue >= batchSize) {
                            const sourceId = 'inputQueueBox';
                            const sourceCenter = this.getComponentCenter(sourceId);
                            const destCenter = this.getComponentCenter(destId);

                            const newBatch = [];
                            for(let k = 0; k < batchSize; k++) {
                                this.pieceCounter++;
                                const newPiece = `P${this.pieceCounter}`;
                                newBatch.push(newPiece);
                                this.pieceTrackingData[newPiece] = { startTime: this.currentTime, id: newPiece };

                                // Generate unique color for this piece
                                const pieceColor = generatePieceColor(newPiece);

                                // Create piece with unique color
                                const piece = this.createPiece(newPiece, sourceCenter.x, sourceCenter.y, pieceColor);

                                this.pieceLocations[newPiece] = destId;
                            }

                            // Track S1 entries for cumulative throughput chart
                            this.s1EntriesData.push({ time: this.currentTime, count: batchSize });

                            machine.pieceBatch = newBatch;
                            machine.piece = newBatch.join('+');
                            machine.status = 'occupied';
                            machine.remainingTime = this.getProcessingTime(station);

                            // Move all pieces to station with proper vertical positioning
                            setTimeout(() => {
                                newBatch.forEach(pieceId => {
                                    const piecePos = this.getComponentCenter(destId, pieceId);
                                    this.movePiece(pieceId, piecePos.x, piecePos.y, 400);
                                });
                            }, 50);
                        }
                    } else {
                        const upstreamBuffer = this.buffers[stationIndex - 1];
                        const upstreamStation = this.stations[stationIndex - 1];
                        const piecesInUpstream = upstreamBuffer.pieces.length;
                        const sourceId = upstreamBuffer.capacity > 0 ? `buffer${upstreamBuffer.id}` : `station${upstreamStation.id}`;
                        const destCenter = this.getComponentCenter(destId);

                        if (upstreamBuffer.capacity > 0 && piecesInUpstream >= batchSize) {
                            const pulledBatch = [];
                            for(let k = 0; k < batchSize; k++) {
                                const pieceId = upstreamBuffer.pieces.shift();
                                pulledBatch.push(pieceId);
                                this.pieceLocations[pieceId] = destId;
                            }

                            machine.pieceBatch = pulledBatch;
                            machine.piece = pulledBatch.join('+');
                            machine.status = 'occupied';
                            machine.remainingTime = this.getProcessingTime(station);

                            // Move pieces to station with vertical positioning
                            pulledBatch.forEach(pieceId => {
                                const piecePos = this.getComponentCenter(destId, pieceId);
                                this.movePiece(pieceId, piecePos.x, piecePos.y, 400);
                            });

                            // Update remaining pieces positions in buffer (FIFO restack)
                            setTimeout(() => {
                                upstreamBuffer.pieces.forEach(remainingPieceId => {
                                    const newPos = this.getComponentCenter(sourceId, remainingPieceId);
                                    this.movePiece(remainingPieceId, newPos.x, newPos.y, 300);
                                });
                            }, 100);
                        } else if (upstreamBuffer.capacity === 0) {
                            const blockedMachine = upstreamStation.machines.find(
                                m => m.status === 'blocked' && m.pieceBatch.length === batchSize
                            );

                            if (blockedMachine) {
                                machine.pieceBatch = blockedMachine.pieceBatch;
                                machine.piece = blockedMachine.piece;
                                machine.status = 'occupied';
                                machine.remainingTime = this.getProcessingTime(station);

                                blockedMachine.piece = null;
                                blockedMachine.pieceBatch = [];
                                blockedMachine.status = 'free';

                                // Move pieces with vertical positioning
                                machine.pieceBatch.forEach(pieceId => {
                                    const piecePos = this.getComponentCenter(destId, pieceId);
                                    this.movePiece(pieceId, piecePos.x, piecePos.y, 400);
                                    this.pieceLocations[pieceId] = destId;
                                });
                            }
                        }
                    }
                }
            });
        });
        
        this.buffers.forEach(buffer => {
            buffer.cumulativeFill += buffer.pieces.length;
        });
    
        // Always update cumulative throughput chart at every step
        if (this.s1EntriesData.length > 0 || this.s5ExitsData.length > 0) {
            this.updateCumulativeThroughputChart();
        }

        if (this.currentTime > 0 && this.currentTime % this.logStep === 0) {
            this.updateMetrics();
        }

        if (this.completedPieces > previousCompletedPieces) {
            this.checkMilestones();
        }

        if (this.currentTime % 10 === 0) {
            this.updateGanttChart();
        }

        this.updateUI();
        this.updateProductionLine();
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    getTotalWIP() {
        const stationWIP = this.stations.reduce((sum, station) => {
            const stationTotal = station.machines.reduce((machineSum, machine) => {
                return machineSum + machine.pieceBatch.length;
            }, 0);
            return sum + stationTotal;
        }, 0);
        const bufferWIP = this.buffers.reduce((sum, b) => sum + b.pieces.length, 0);
        return stationWIP + bufferWIP;
    }

    checkMilestones() {
        const completed = this.completedPieces;
        
        this.milestonePieces.forEach((m, index) => {
            if (completed === m) {
                console.log(`MILESTONE: ${m} parts completed at T=${this.currentTime}s!`);
            }
        });
        
        this.milestoneTimes.forEach(m => {
            if (this.currentTime === m) {
                console.log(`MILESTONE: Simulation reached T=${m}s!`);
            }
        });
    }

    checkConvergence() {
        const windowSize = 50;
        const cvThreshold = 0.05;
        
        if (this.throughputData.length < windowSize || this.currentTime <= this.warmupPeriod) {
            return { converged: false, message: 'Simulation Running: Collecting Data...' };
        }

        const recentThroughputs = this.throughputData.slice(-windowSize).map(d => d.y);
        
        const mean = recentThroughputs.reduce((sum, val) => sum + val, 0) / windowSize;
        
        if (mean === 0) {
            return { converged: false, message: 'Waiting for Stabilization...' };
        }
        
        const variance = recentThroughputs.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / windowSize;
        const stdDev = Math.sqrt(variance);
        const cv = stdDev / mean;
        
        const isConverged = cv < cvThreshold;
        
        let message;
        if (isConverged) {
            message = `STEADY STATE REACHED! (Throughput CV: ${cv.toFixed(3)})`;
        } else {
            message = `Not stable (CV: ${cv.toFixed(3)}). Continuing...`;
        }

        return { converged: isConverged, message: message };
    }

    calculateThroughput() {
        if (this.currentTime <= this.warmupPeriod) return 0;
        
        const effectiveStartTime = this.warmupPeriod;
        const effectiveCurrentTime = this.currentTime;
        
        const completionsAfterWarmup = this.completionHistory.filter(d => d.time > effectiveStartTime);
        const piecesCompletedAfterWarmup = completionsAfterWarmup.length;
        
        const actualTimeWindow = effectiveCurrentTime - effectiveStartTime;

        return actualTimeWindow > 0 ? (piecesCompletedAfterWarmup / actualTimeWindow) * 3600 : 0;
    }

    calculateAverageLeadTime() {
        const recentWindowSize = 20;
        const recentLeadTimes = this.completedLeadTimes.slice(-recentWindowSize);
        
        if (recentLeadTimes.length > 0) {
            const sum = recentLeadTimes.reduce((acc, lt) => acc + lt, 0);
            return sum / recentLeadTimes.length;
        }
        return 0;
    }

    zoomToRecent(chart, force = false) {
        if (!chart || !chart.canvas) return;

        const chartId = chart.canvas.id;
        if (this.userInteractedWithChart[chartId] && !force) return;

        // Get actual data range from the chart
        const labels = chart.data.labels;
        if (!labels || labels.length === 0) return;

        const maxTime = Math.max(...labels);
        const minTime = Math.max(labels[0] || 0, maxTime - this.zoomWindow);

        chart.options.scales.x.min = minTime;
        chart.options.scales.x.max = maxTime;
    }

    // ============================================
    // METRICS & LOGGING
    // ============================================

    updateMetrics() {
        const throughput = this.calculateThroughput();
        const avgLeadTime = this.calculateAverageLeadTime();
        const totalWIP = this.getTotalWIP();

        if (this.currentTime > this.warmupPeriod) {
            this.throughputData.push({ x: this.currentTime, y: Math.round(throughput) });
            this.wipData.push({ x: this.currentTime, y: totalWIP });
            this.leadTimeData.push({ x: this.currentTime, y: Math.round(avgLeadTime * 10) / 10 });
            
            this.logData(throughput, totalWIP, avgLeadTime);

            const convergenceStatus = this.checkConvergence();
            this.isConverged = convergenceStatus.converged;
            this.updateConvergenceIndicator(convergenceStatus.message, convergenceStatus.converged);

            this.updateCharts();
        } else {
            this.updateConvergenceIndicator(`Warm-up Period: ${this.currentTime} / ${this.warmupPeriod} seconds`, false);
        }
    }

    logData(throughput, totalWIP, avgLeadTime) {
        const bufferAvgUtils = this.buffers.map(b => {
            if (b.capacity > 0 && this.currentTime > this.warmupPeriod) {
                const effectiveTime = this.currentTime - this.warmupPeriod;
                return (((b.cumulativeFill / effectiveTime) / b.capacity) * 100).toFixed(1);
            }
            return '0.0';
        });

        const logEntry = {
            time: this.currentTime,
            throughput: Math.round(throughput),
            wip: totalWIP,
            leadTime: avgLeadTime.toFixed(1),
            wipInput: this.wip,
            b1_capacity: this.buffers[0].capacity,
            b2_capacity: this.buffers[1].capacity,
            b3_capacity: this.buffers[2].capacity,
            b4_capacity: this.buffers[3].capacity,
        };

        this.stations.forEach((s, i) => {
            const index = i + 1;
            logEntry[`s${index}_dist`] = s.dist;
            logEntry[`s${index}_mean`] = s.params.mean;
            logEntry[`s${index}_oee`] = s.oee.toFixed(2);
            logEntry[`s${index}_batch`] = s.batchSize;
            logEntry[`s${index}_parallel`] = s.parallelMachines;
            logEntry[`s${index}_var`] = s.params.variance;
            logEntry[`s${index}_min`] = s.params.min;
            logEntry[`s${index}_max`] = s.params.max;
            logEntry[`s${index}_mode`] = s.params.mode;
            
            const freeMachines = s.machines.filter(m => m.status === 'free').length;
            const occupiedMachines = s.machines.filter(m => m.status === 'occupied').length;
            const blockedMachines = s.machines.filter(m => m.status === 'blocked').length;
            const busyMachines = occupiedMachines + blockedMachines;
            
            logEntry[`s${index}_free`] = freeMachines;
            logEntry[`s${index}_busy`] = busyMachines;
            logEntry[`s${index}_blocked`] = blockedMachines;
            
            const allPieces = s.machines.flatMap(m => m.pieceBatch);
            logEntry[`s${index}_pieces`] = allPieces.join('_');
        });

        this.buffers.forEach((b, i) => {
            const index = i + 1;
            logEntry[`b${index}_count`] = b.pieces.length;
            logEntry[`b${index}_pieces`] = b.pieces.join('_');
            logEntry[`b${index}_avg_util`] = bufferAvgUtils[i];
        });
        
        this.fullLog.push(logEntry);
    }

    exportLogToCSV() {
        if (this.fullLog.length === 0) {
            console.error("No data to export. Please run the simulation first.");
            return;
        }

        const headers = [
            'Time', 'Warmup_Period', 'Throughput', 'WIP', 'LeadTime', 'Input_WIP',
            'B1_Cap', 'B2_Cap', 'B3_Cap', 'B4_Cap',
        ];

        for (let i = 1; i <= 5; i++) {
            headers.push(
                `S${i}_Dist`, `S${i}_Mean`, `S${i}_OEE`, `S${i}_Batch`, `S${i}_Parallel`,
                `S${i}_Var`, `S${i}_Min`, `S${i}_Max`, `S${i}_Mode`,
                `S${i}_Free`, `S${i}_Busy`, `S${i}_Blocked`, `S${i}_Pieces`
            );
        }
        for (let i = 1; i <= 4; i++) {
            headers.push(`B${i}_Count`, `B${i}_Pieces`, `B${i}_Avg_Util`);
        }
        
        const rows = this.fullLog.map(entry => {
            const row = [
                entry.time, this.warmupPeriod, entry.throughput, entry.wip, entry.leadTime, entry.wipInput,
                entry.b1_capacity, entry.b2_capacity, entry.b3_capacity, entry.b4_capacity,
            ];
            for (let i = 1; i <= 5; i++) {
                row.push(
                    entry[`s${i}_dist`], entry[`s${i}_mean`], entry[`s${i}_oee`],
                    entry[`s${i}_batch`], entry[`s${i}_parallel`],
                    entry[`s${i}_var`], entry[`s${i}_min`], entry[`s${i}_max`], entry[`s${i}_mode`],
                    entry[`s${i}_free`], entry[`s${i}_busy`], entry[`s${i}_blocked`],
                    `"${entry[`s${i}_pieces`]}"`
                );
            }
            for (let i = 1; i <= 4; i++) {
                row.push(entry[`b${i}_count`], `"${entry[`b${i}_pieces`]}"`, entry[`b${i}_avg_util`]);
            }
            return row.join(',');
        });

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "simulation_log_parallel.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // ============================================
    // CHART UPDATES
    // ============================================

    updateCharts() {
        const startIndex = this.throughputData.findIndex(d => d.x >= this.warmupPeriod);

        const filteredData = this.throughputData.slice(startIndex >= 0 ? startIndex : 0);
        const filteredWIP = this.wipData.slice(startIndex >= 0 ? startIndex : 0);
        const filteredLeadTime = this.leadTimeData.slice(startIndex >= 0 ? startIndex : 0);

        this.throughputChart.data.labels = filteredData.map(d => d.x);
        this.throughputChart.data.datasets[0].data = filteredData.map(d => d.y);
        this.wipChart.data.labels = filteredWIP.map(d => d.x);
        this.wipChart.data.datasets[0].data = filteredWIP.map(d => d.y);
        this.leadTimeChart.data.labels = filteredLeadTime.map(d => d.x);
        this.leadTimeChart.data.datasets[0].data = filteredLeadTime.map(d => d.y);

        this.zoomToRecent(this.throughputChart);
        this.zoomToRecent(this.wipChart);
        this.zoomToRecent(this.leadTimeChart);

        this.throughputChart.update('none');
        this.wipChart.update('none');
        this.leadTimeChart.update('none');

        this.updateLeadTimeHistogram();
        this.updateLittlesLawChart();
        // Note: updateCumulativeThroughputChart() is called in step() function, not here
    }

    updateLeadTimeHistogram() {
        if (this.completedLeadTimes.length === 0) return;

        const bins = 10;
        const minLT = Math.min(...this.completedLeadTimes);
        const maxLT = Math.max(...this.completedLeadTimes);
        const binSize = (maxLT - minLT) / bins || 1;

        const histogram = new Array(bins).fill(0);
        const binLabels = [];

        for (let i = 0; i < bins; i++) {
            const binStart = minLT + i * binSize;
            const binEnd = minLT + (i + 1) * binSize;
            binLabels.push(`${Math.round(binStart)}-${Math.round(binEnd)}`);
        }

        this.completedLeadTimes.forEach(lt => {
            const binIndex = Math.min(Math.floor((lt - minLT) / binSize), bins - 1);
            histogram[binIndex]++;
        });

        this.leadTimeHistogram.data.labels = binLabels;
        this.leadTimeHistogram.data.datasets[0].data = histogram;
        this.leadTimeHistogram.update('none');
    }

    updateLittlesLawChart() {
        if (this.wipData.length === 0 || this.throughputData.length === 0) return;

        const combinedData = [];
        const pointColors = [];
        const pointRadii = [];
        const minLength = Math.min(this.wipData.length, this.throughputData.length);

        for (let i = 0; i < minLength; i++) {
            if (this.wipData[i] && this.throughputData[i]) {
                combinedData.push({
                    x: this.wipData[i].y,
                    y: this.throughputData[i].y
                });

                // Last point is red and larger, all others are teal
                if (i === minLength - 1) {
                    pointColors.push('rgba(239, 68, 68, 0.8)'); // Red
                    pointRadii.push(6);
                } else {
                    pointColors.push('rgba(33, 128, 141, 0.6)'); // Teal
                    pointRadii.push(4);
                }
            }
        }

        this.littlesLawChart.data.datasets[0].data = combinedData;
        this.littlesLawChart.data.datasets[0].backgroundColor = pointColors;
        this.littlesLawChart.data.datasets[0].pointRadius = pointRadii;
        this.littlesLawChart.update('none');
    }

    updateCumulativeThroughputChart() {
        if (!this.cumulativeThroughputChart) return;

        // Build data points in {x, y} format directly
        const s1Data = [];
        const s5Data = [];

        let s1Cumulative = 0;
        let s5Cumulative = 0;

        // Collect all time points
        const allTimes = new Set([0]);
        this.s1EntriesData.forEach(d => allTimes.add(d.time));
        this.s5ExitsData.forEach(d => allTimes.add(d.time));
        if (this.currentTime > 0) allTimes.add(this.currentTime);

        const timePoints = Array.from(allTimes).sort((a, b) => a - b);

        let s1Index = 0;
        let s5Index = 0;

        for (const time of timePoints) {
            // Process S1 entries at this time
            while (s1Index < this.s1EntriesData.length && this.s1EntriesData[s1Index].time <= time) {
                s1Cumulative += this.s1EntriesData[s1Index].count;
                s1Index++;
            }

            // Process S5 exits at this time
            while (s5Index < this.s5ExitsData.length && this.s5ExitsData[s5Index].time <= time) {
                s5Cumulative += this.s5ExitsData[s5Index].count;
                s5Index++;
            }

            s1Data.push({x: time, y: s1Cumulative});
            s5Data.push({x: time, y: s5Cumulative});
        }

        // Update chart with {x, y} data
        this.cumulativeThroughputChart.data.datasets[0].data = s1Data;
        this.cumulativeThroughputChart.data.datasets[1].data = s5Data;

        // Simple zoom to recent data
        if (!this.userInteractedWithChart['cumulativeThroughputChart'] && timePoints.length > 0) {
            const maxTime = Math.max(...timePoints);
            const minTime = Math.max(0, maxTime - this.zoomWindow);

            this.cumulativeThroughputChart.options.scales.x.min = minTime;
            this.cumulativeThroughputChart.options.scales.x.max = maxTime;

            // Calculate Y-axis range for recent window to spread the lines
            const recentS1Data = s1Data.filter(d => d.x >= minTime);
            const recentS5Data = s5Data.filter(d => d.x >= minTime);

            if (recentS1Data.length > 0 && recentS5Data.length > 0) {
                const allRecentY = [...recentS1Data.map(d => d.y), ...recentS5Data.map(d => d.y)];
                const minY = Math.min(...allRecentY);
                const maxY = Math.max(...allRecentY);
                const yRange = maxY - minY;

                // Add 20% padding to separate lines visually
                const padding = Math.max(yRange * 0.2, 2);
                this.cumulativeThroughputChart.options.scales.y.min = Math.max(0, minY - padding);
                this.cumulativeThroughputChart.options.scales.y.max = maxY + padding;
            }
        }

        this.cumulativeThroughputChart.update('none');
    }

    // Gestione zoom specifica per il grafico cumulativo
    zoomCumulativeChart(mode) {
        if (!this.cumulativeThroughputChart) return;

        const datasets = this.cumulativeThroughputChart.data.datasets;
        if (!datasets || !datasets[0] || !datasets[0].data.length) return;

        // Estrai tutti i valori x dai dati
        const allXValues = [];
        datasets.forEach(dataset => {
            dataset.data.forEach(point => {
                if (point && typeof point.x !== 'undefined') {
                    allXValues.push(point.x);
                }
            });
        });

        if (allXValues.length === 0) return;

        const minX = Math.min(...allXValues);
        const maxX = Math.max(...allXValues);

        if (mode === 'recent') {
            this.cumulativeThroughputChart.options.scales.x.min = Math.max(minX, maxX - this.zoomWindow);
            this.cumulativeThroughputChart.options.scales.x.max = maxX;
        } else if (mode === 'full') {
            this.cumulativeThroughputChart.options.scales.x.min = minX;
            this.cumulativeThroughputChart.options.scales.x.max = maxX;
        }

        this.cumulativeThroughputChart.update('none');
        this.userInteractedWithChart['cumulativeThroughputChart'] = true;
    }

    updateConvergenceIndicator(message, isConverged) {
        const indicator = document.getElementById('convergenceIndicator');
        if (this.currentTime === 0 && !this.isRunning) {
            indicator.style.display = 'none';
        } else {
            indicator.style.display = 'block';
            indicator.textContent = message;
            if (isConverged) {
                indicator.classList.add('status-converged');
            } else {
                indicator.classList.remove('status-converged');
            }
        }
    }

    // ============================================
    // UI UPDATES
    // ============================================

    updateUI() {
        document.getElementById('currentTime').textContent = this.currentTime;
        document.getElementById('completedPieces').textContent = this.completedPieces;
        document.getElementById('throughputRate').textContent = Math.round(this.calculateThroughput());
        document.getElementById('avgLeadTime').textContent = this.calculateAverageLeadTime().toFixed(1);
        
        const totalWIP = this.getTotalWIP();
        const waitingQueue = Math.max(0, this.wip - totalWIP);
        document.getElementById('wipInLine').textContent = totalWIP;
        document.getElementById('waitingQueue').textContent = waitingQueue;

        this.stations.forEach((station, index) => {
            const stationNum = index + 1;
            const occupiedPercent = station.totalTime > 0 ? (station.workingTime / station.totalTime * 100) : 0;
            const processingPercent = station.totalTime > 0 ? (station.processingTime / station.totalTime * 100) : 0;
            document.getElementById(`station${stationNum}Occupied`).textContent = occupiedPercent.toFixed(1) + '% Occupied';
            document.getElementById(`station${stationNum}Processing`).textContent = processingPercent.toFixed(1) + '% Processing';
        });

        this.buffers.forEach((buffer, index) => {
            const bufferNum = index + 1;
            const fillPercent = buffer.capacity > 0 ? (buffer.pieces.length / buffer.capacity * 100) : 0;
            document.getElementById(`buffer${bufferNum}Status`).textContent = `Current: ${buffer.pieces.length}/${buffer.capacity} (${Math.round(fillPercent)}%)`;

            let avgUtilization = 0;
            const effectiveTime = this.currentTime - this.warmupPeriod;
            if (effectiveTime > 0 && buffer.capacity > 0) {
                const cumulativeFillSinceWarmup = buffer.cumulativeFill;
                const avgFill = cumulativeFillSinceWarmup / effectiveTime;
                avgUtilization = (avgFill / buffer.capacity) * 100;
            } else if (this.currentTime > 0 && buffer.capacity > 0) {
                const avgFill = buffer.cumulativeFill / this.currentTime;
                avgUtilization = (avgFill / buffer.capacity) * 100;
            }

            document.getElementById(`buffer${bufferNum}AvgUtilization`).textContent = `Avg Util: ${avgUtilization.toFixed(1)}%`;
        });

        document.getElementById('queueCount').textContent = waitingQueue;
    }

    updateStationConfigUI() {
        this.stations.forEach((station, i) => {
            const distChar = station.dist.charAt(0).toUpperCase();
            const adjustedMean = station.oee > 0 ? (station.params.mean / station.oee) : Infinity;
            
            let displayString;
            if (adjustedMean === Infinity) {
                displayString = `∞s (${distChar}, OEE ${station.oee.toFixed(2)}, M:${station.parallelMachines}, B:${station.batchSize})`;
            } else {
                displayString = `${adjustedMean.toFixed(1)}s (${distChar}, OEE ${station.oee.toFixed(2)}, M:${station.parallelMachines}, B:${station.batchSize})`;
            }

            document.getElementById(`station${i+1}DurationDisplay`).textContent = displayString;
            document.getElementById(`station${i+1}OEE`).value = station.oee.toFixed(2);
            document.getElementById(`station${i+1}Batch`).value = station.batchSize;
            document.getElementById(`station${i+1}Parallel`).value = station.parallelMachines;
            document.getElementById(`station${i+1}Dist`).value = station.dist;
        });
    }

    updateQueueVisualization() {
        const queueBox = document.getElementById('inputQueueBox');
        const waitingQueue = Math.max(0, this.wip - this.getTotalWIP());

        // Remove old queue pieces
        const oldPieces = queueBox.querySelectorAll('.queue-piece');
        oldPieces.forEach(piece => piece.remove());

        // Create visual representation of waiting pieces (max 10 visible)
        const maxVisible = Math.min(waitingQueue, 10);

        for (let i = 0; i < maxVisible; i++) {
            const piece = document.createElement('div');
            piece.className = 'queue-piece';

            // All pieces are gray
            piece.style.backgroundColor = '#9ca3af';

            // Position pieces in a vertical column from bottom to top
            const spacing = 12; // pixels between pieces
            const yOffset = -spacing * i;

            piece.style.left = '50%';
            piece.style.top = `calc(50% + ${yOffset}px)`;
            piece.style.transform = 'translate(-50%, -50%)';
            piece.style.zIndex = i;

            // Add animation delay for staggered appearance
            piece.style.animationDelay = `${i * 0.05}s`;

            queueBox.appendChild(piece);
        }

        // If more than 10, show indicator
        if (waitingQueue > 10) {
            const moreIndicator = document.createElement('div');
            moreIndicator.className = 'queue-piece';
            moreIndicator.style.backgroundColor = '#fff';
            moreIndicator.style.width = '14px';
            moreIndicator.style.height = '14px';
            moreIndicator.style.left = '50%';
            moreIndicator.style.top = 'calc(50% - 120px)';
            moreIndicator.style.transform = 'translate(-50%, -50%)';
            moreIndicator.style.zIndex = '999';
            moreIndicator.style.fontSize = '8px';
            moreIndicator.style.fontWeight = 'bold';
            moreIndicator.style.color = '#000';
            moreIndicator.style.display = 'flex';
            moreIndicator.style.alignItems = 'center';
            moreIndicator.style.justifyContent = 'center';
            moreIndicator.textContent = '+';
            queueBox.appendChild(moreIndicator);
        }
    }

    updateProductionLine() {
        // Update queue visualization
        this.updateQueueVisualization();

        this.stations.forEach((station, i) => {
            const stationNum = i + 1;

            const freeMachines = station.machines.filter(m => m.status === 'free').length;
            const occupiedMachines = station.machines.filter(m => m.status === 'occupied').length;
            const blockedMachines = station.machines.filter(m => m.status === 'blocked').length;
            const totalMachines = station.machines.length;

            let stationStatus;
            if (freeMachines === totalMachines) {
                stationStatus = 'free';
            } else if (blockedMachines >= occupiedMachines && blockedMachines > 0) {
                stationStatus = 'blocked';
            } else {
                stationStatus = 'occupied';
            }

            document.getElementById(`station${stationNum}`).className = `station status-${stationStatus}`;

            const busyMachines = occupiedMachines + blockedMachines;
            let pieceDisplay = `${busyMachines}/${totalMachines}`;

            const workingMachines = station.machines.filter(m => m.piece);
            if (workingMachines.length > 0) {
                const totalPieces = workingMachines.reduce((sum, m) => sum + m.pieceBatch.length, 0);
                pieceDisplay += ` (${totalPieces}p)`;
            }

            document.getElementById(`station${stationNum}Piece`).textContent = pieceDisplay;

            const workingTimes = station.machines
                .filter(m => m.remainingTime > 0)
                .map(m => m.remainingTime);

            let timeDisplay = '';
            if (workingTimes.length > 0) {
                const minTime = Math.min(...workingTimes);
                const maxTime = Math.max(...workingTimes);
                if (minTime === maxTime) {
                    timeDisplay = `${minTime}s`;
                } else {
                    timeDisplay = `${minTime}-${maxTime}s`;
                }
            }

            document.getElementById(`station${stationNum}Time`).textContent = timeDisplay;
            document.getElementById(`station${stationNum}Status`).textContent = stationStatus;

            // Pieces keep their original unique colors - no color change
        });

        this.buffers.forEach((buffer, i) => {
            const bufferNum = i + 1;
            document.getElementById(`buffer${bufferNum}Count`).textContent = `${buffer.pieces.length}/${buffer.capacity}`;
            const fillPercent = buffer.capacity > 0 ? (buffer.pieces.length / buffer.capacity * 100) : 0;
            document.getElementById(`buffer${bufferNum}Fill`).textContent = `${Math.round(fillPercent)}%`;

            // Keep original colors in buffer - no color change
            // Pieces maintain their station color when in buffer
        });

        // Update station piece positions to ensure proper vertical arrangement
        this.stations.forEach((station, i) => {
            const stationId = `station${station.id}`;
            station.machines.forEach(machine => {
                if (machine.pieceBatch.length > 0) {
                    machine.pieceBatch.forEach(pieceId => {
                        const piece = document.getElementById(`moving-piece-${pieceId}`);
                        if (piece) {
                            const correctPos = this.getComponentCenter(stationId, pieceId);
                            piece.style.transition = 'transform 0.2s ease-out';
                            piece.style.transform = `translate(${correctPos.x - 4}px, ${correctPos.y - 4}px)`;
                        }
                    });
                }
            });
        });
    }

    // ============================================
    // GANTT CHART
    // ============================================

    recordGanttData() {
        const snapshot = {
            time: this.currentTime,
            stations: this.stations.map(station => ({
                id: station.id,
                machines: station.machines.map(machine => ({
                    status: machine.status,
                    piece: machine.piece,
                    remainingTime: machine.remainingTime
                }))
            }))
        };
        this.ganttData.push(snapshot);
    }

    updateGanttChart() {
        if (!this.ganttChart) return;

        const { canvas, ctx } = this.ganttChart;
        if (!canvas || !ctx) return;

        const container = canvas.parentElement;
        const width = container.offsetWidth - 24;
        const height = 400;

        if (canvas.width !== width) {
            canvas.width = width;
            canvas.height = height;
        }

        ctx.clearRect(0, 0, width, height);

        if (this.ganttData.length < 2) {
            ctx.fillStyle = '#999';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Gantt chart will appear after simulation starts...', width / 2, height / 2);
            return;
        }

        const startTime = Math.max(0, this.currentTime - this.ganttWindow);
        const endTime = this.currentTime;
        const timeRange = endTime - startTime || 1;

        const filteredData = this.ganttData.filter(d => d.time >= startTime && d.time <= endTime);
        if (filteredData.length < 2) return;

        const padding = { top: 40, right: 20, bottom: 40, left: 80 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        const allMachines = [];
        this.stations.forEach(station => {
            station.machines.forEach((_, idx) => {
                allMachines.push({ stationId: station.id, machineIdx: idx });
            });
        });

        if (allMachines.length === 0) return;

        const rowHeight = chartHeight / allMachines.length;

        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--color-text') || '#333';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        allMachines.forEach((m, i) => {
            const y = padding.top + i * rowHeight + rowHeight / 2;
            ctx.fillText(`S${m.stationId}-M${m.machineIdx + 1}`, padding.left - 10, y);
        });

        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        allMachines.forEach((_, i) => {
            const y = padding.top + i * rowHeight;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();
        });

        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--color-text') || '#333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const numTicks = 5;
        for (let i = 0; i <= numTicks; i++) {
            const t = startTime + (timeRange * i) / numTicks;
            const x = padding.left + (chartWidth * i) / numTicks;
            ctx.fillText(Math.round(t), x, height - padding.bottom + 10);
        }

        const statusColors = {
            free: '#10b981',
            occupied: '#ef4444',
            blocked: '#3b82f6'
        };

        filteredData.forEach((snapshot, idx) => {
            if (idx === 0) return;
            const prevSnapshot = filteredData[idx - 1];
            const t1 = prevSnapshot.time;
            const t2 = snapshot.time;
            const x1 = padding.left + ((t1 - startTime) / timeRange) * chartWidth;
            const x2 = padding.left + ((t2 - startTime) / timeRange) * chartWidth;

            let machineIndex = 0;
            prevSnapshot.stations.forEach(station => {
                station.machines.forEach(machine => {
                    const y = padding.top + machineIndex * rowHeight;
                    const color = statusColors[machine.status] || '#888';
                    ctx.fillStyle = color;
                    ctx.fillRect(x1, y, x2 - x1, rowHeight - 2);
                    machineIndex++;
                });
            });
        });

        ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--color-text') || '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(padding.left, padding.top, chartWidth, chartHeight);

        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--color-text') || '#333';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Time (seconds)', width / 2, height - 5);
    }

}

// ============================================
// APPLICATION INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const simulator = new ProductionLineSimulator();
});