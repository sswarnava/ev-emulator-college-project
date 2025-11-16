import Charger from './Charger';

export class EmulatorManager {
    private chargers: Map<string, Charger> = new Map();
    private telemetryHandler: ((t: any) => void) | null = null;

    spawnCharger(id: string): Charger {
        let c = this.chargers.get(id);
        if (!c) {
            c = new Charger(id);
            this.chargers.set(id, c);
            console.log(`EmulatorManager: spawned charger ${id}`);
            // attach telemetry handler if present
            if (this.telemetryHandler) {
                try {
                    c.onTelemetry(this.telemetryHandler);
                } catch (err) {
                    // ignore
                }
            }
        } else {
            console.log(`EmulatorManager: charger ${id} already exists`);
        }
        return c;
    }

    startSession(chargerId: string, sessionId: string): boolean {
        const c = this.chargers.get(chargerId);
        if (!c) {
            console.log(`startSession: charger ${chargerId} not found`);
            return false;
        }
        return c.startSession(sessionId);
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
        for (const c of this.chargers.values()) {
            try {
                c.onTelemetry(cb);
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
}

export const emulatorManager = new EmulatorManager();

export default emulatorManager;
