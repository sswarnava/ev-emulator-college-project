import Charger from './Charger';

export class EmulatorManager {
    private static readonly GRID_LIMIT = 10; // kW
    private static readonly HEARTBEAT_TIMEOUT = 60 * 1000; // 60 seconds
    private chargers: Map<string, Charger> = new Map();
    private telemetryHandler: ((t: any) => void) | null = null;
    private telemetryWrapper: ((t: any) => void) | null = null;

    constructor() {
        // Periodically check heartbeat status every 5 seconds
        setInterval(() => {
            try {
                this.checkHeartbeatStatus();
            } catch (err) {
                // ignore
            }
        }, 5000);
    }

    spawnCharger(id: string): Charger {
        let c = this.chargers.get(id);
        if (!c) {
            c = new Charger(id);
            this.chargers.set(id, c);
            console.log(`EmulatorManager: spawned charger ${id}`);
            // attach telemetry handler if present
            if (this.telemetryWrapper) {
                try {
                    c.onTelemetry(this.telemetryWrapper);
                } catch (err) {
                    // ignore
                }
            }
        } else {
            console.log(`EmulatorManager: charger ${id} already exists`);
        }
        return c;
    }

    getTotalPower(): number {
        let total = 0;
        for (const c of this.chargers.values()) {
            if (c.status === 'CHARGING') {
                total += (c.lastPower || 0);
            }
        }
        return total;
    }

    applyThrottling(): void {
        try {
            const totalPower = this.getTotalPower();
            if (totalPower <= EmulatorManager.GRID_LIMIT) {
                // Clear any throttles if present
                for (const c of this.chargers.values()) {
                    if (c.status === 'CHARGING') {
                        c.unthrottle();
                    }
                }
                return;
            }
            // If over limit, throttle all charging chargers
            for (const c of this.chargers.values()) {
                if (c.status === 'CHARGING') {
                    try {
                        c.throttleCurrent();
                    } catch (err) {
                        // ignore per-charger errors
                    }
                }
            }
        } catch (err) {
            console.error('applyThrottling error:', err);
        }
    }

    checkHeartbeatStatus(): void {
        const now = Date.now();
        for (const c of this.chargers.values()) {
            try {
                const elapsed = now - (c.lastHeartbeat || 0);
                if (elapsed > EmulatorManager.HEARTBEAT_TIMEOUT) {
                    if (c.status !== 'OFFLINE') {
                        c.status = 'OFFLINE';
                        console.log(`[${c.id}] marked OFFLINE`);
                    }
                } else {
                    if (c.status === 'OFFLINE') {
                        c.status = 'AVAILABLE';
                        console.log(`[${c.id}] heartbeat resumed — marked AVAILABLE`);
                    }
                }
            } catch (err) {
                // ignore per-charger errors
            }
        }
    }

    async startSession(chargerId: string, sessionId: string): Promise<{ ok: boolean; error?: string }> {
        const c = this.chargers.get(chargerId);
        if (!c) {
            console.log(`startSession: charger ${chargerId} not found`);
            return { ok: false, error: 'NOT_FOUND' };
        }
        return await c.startSession(sessionId);
    }

    stopSession(chargerId: string): boolean {
        const c = this.chargers.get(chargerId);
        if (!c) {
            console.log(`stopSession: charger ${chargerId} not found`);
            return false;
        }
        c.stopSession();
        return true;
    }
    
    stopAllTelemetry() {
        for (const c of this.chargers.values()) {
            c.stopTelemetry();
        }
    }

    injectFault(chargerId: string, faultType: string): boolean {
        const c = this.chargers.get(chargerId);
        if (!c) {
            console.log(`injectFault: charger ${chargerId} not found`);
            return false;
        }
        c.injectFault(faultType);
        return true;
    }

    setTelemetryHandler(cb: (t: any) => void) {
        this.telemetryHandler = cb;
        // create a wrapper that calls the external handler and then applies throttling
        this.telemetryWrapper = (t: any) => {
            try {
                cb(t);
            } catch (err) {
                // ignore handler errors
            }
            // after telemetry, recalc and apply throttling
            try {
                this.applyThrottling();
            } catch (err) {
                // ignore
            }
        };
        for (const c of this.chargers.values()) {
            try {
                c.onTelemetry(this.telemetryWrapper);
            } catch (err) {
                // ignore
            }
        }
    }

    getCharger(chargerId: string): Charger | null {
        return this.chargers.get(chargerId) ?? null;
    }

    listChargers(): string[] {
        return Array.from(this.chargers.keys());
    }

    stopAll(): void {
        for (const [id, charger] of this.chargers.entries()) {
            try {
                charger.stopSession();
                console.log(`Stopped charger ${id}`);
            } catch (err) {
                console.error(`Error stopping charger ${id}:`, err);
            }
        }
    }

    deleteCharger(id: string): boolean {
        const c = this.chargers.get(id);
        if (!c) {
            return false;
        }
        try {
            c.stopTelemetry();
        } catch (err) {
            // ignore
        }
        this.chargers.delete(id);
        console.log(`EmulatorManager: deleted charger ${id}`);
        return true;
    }

    resetCharger(id: string): boolean {
        const c = this.chargers.get(id);
        if (!c) {
            console.log(`resetCharger: charger ${id} not found`);
            return false;
        }
        try {
            c.reset();
            return true;
        } catch (err) {
            console.error(`Error resetting charger ${id}:`, err);
            return false;
        }
    }

    setMode(id: string, mode: string): boolean {
        const c = this.chargers.get(id);
        if (!c) {
            console.log(`setMode: charger ${id} not found`);
            return false;
        }
        try {
            c.setMode(mode);
            return true;
        } catch (err) {
            console.error(`Error setting mode for charger ${id}:`, err);
            return false;
        }
    }

    forceIdle(id: string, flag: boolean): boolean {
        const c = this.chargers.get(id);
        if (!c) {
            console.log(`forceIdle: charger ${id} not found`);
            return false;
        }
        try {
            c.setForceIdle(!!flag);
            return true;
        } catch (err) {
            console.error(`Error forcing idle for charger ${id}:`, err);
            return false;
        }
    }

    pauseTelemetry(id: string): boolean {
        const c = this.chargers.get(id);
        if (!c) {
            console.log(`pauseTelemetry: charger ${id} not found`);
            return false;
        }
        try {
            c.pauseTelemetry();
            return true;
        } catch (err) {
            console.error(`Error pausing telemetry for charger ${id}:`, err);
            return false;
        }
    }

    resumeTelemetry(id: string): boolean {
        const c = this.chargers.get(id);
        if (!c) {
            console.log(`resumeTelemetry: charger ${id} not found`);
            return false;
        }
        try {
            c.resumeTelemetry();
            return true;
        } catch (err) {
            console.error(`Error resuming telemetry for charger ${id}:`, err);
            return false;
        }
    }
}

export const emulatorManager = new EmulatorManager();

export default emulatorManager;
