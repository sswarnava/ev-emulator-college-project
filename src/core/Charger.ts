import { insertSessionStart, updateSessionStop, getSessionStartTime } from "../db/database";

export type ChargerStatus = 'AVAILABLE' | 'CHARGING' | 'FAULTY';

export class Charger {
  public id: string;
  public status: ChargerStatus;
  public meterKWh: number;
  public currentSessionId: string | null;
  public currentLimit: number | null = null;
  public lastPower: number = 0;
  public telemetryInterval: ReturnType<typeof setInterval> | null;
  private telemetryListeners: Array<(t: any) => void> = [];

  private static readonly RATE_PER_KWH = 12; // Rs.12 per kWh

  constructor(id: string) {
    this.id = id;
    this.status = 'AVAILABLE';
    this.meterKWh = 0;
    this.currentSessionId = null;
    this.telemetryInterval = null;

    console.log(`Charger ${this.id} created, starting telemetry.`);
    this.startTelemetry();
  }

  startTelemetry() {
    if (this.telemetryInterval) return;
    const intervalMs = 10 * 1000; // 10 seconds
    this.telemetryInterval = setInterval(() => {
      const t = this.generateTelemetry(intervalMs / 1000);
      console.log(`Telemetry [${this.id}]`, t);
    }, intervalMs);
    console.log(`Telemetry started for charger ${this.id}`);
  }

  stopTelemetry() {
    if (!this.telemetryInterval) return;
    clearInterval(this.telemetryInterval);
    this.telemetryInterval = null;
    console.log(`Telemetry stopped for charger ${this.id}`);
  }

  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  generateTelemetry(intervalSeconds = 1) {
    // Voltage between 228 and 240
    const voltage = +(228 + Math.random() * 12).toFixed(2);

    // Current depends on state
    let current = 0;
    if (this.status === 'CHARGING') {
      // If a current limit is applied (throttling), use it; otherwise use normal range
      if (this.currentLimit != null) {
        current = +(this.currentLimit).toFixed(2);
      } else {
        // realistic charging current between 12 and 28 A (2.5kW–6.5kW)
        current = +(this.randomBetween(12, 28)).toFixed(2);
      }
    } else if (this.status === 'AVAILABLE') {
      // small standby leakage/current
      current = +(+Math.random() * 0.2).toFixed(3);
    } else {
      // FAULTY
      current = 0;
    }

    const power_kW = +( (voltage * current) / 1000 ).toFixed(4);

    // accumulate energy in kWh over the provided interval (seconds)
    // energy (kWh) = power_kW * (seconds / 3600)
    const deltaKWh = power_kW * (intervalSeconds / 3600);
    this.meterKWh = +(this.meterKWh + deltaKWh).toFixed(6);
    // store last measured power for manager-level throttling decisions
    this.lastPower = power_kW;

    const telemetry = {
      id: this.id,
      timestamp: new Date().toISOString(),
      voltage,
      current,
      power_kW,
      energy_kWh: this.meterKWh,
      status: this.status,
    };

    // Notify telemetry listeners
    try {
      this.telemetryListeners.forEach((cb) => {
        try {
          cb(telemetry);
        } catch (err) {
          // ignore listener errors
        }
      });
    } catch (err) {
      // ignore
    }

    return telemetry;
  }

  throttleCurrent() {
    // Apply a safe reduced charging current between 10 and 15 A
    this.currentLimit = +(this.randomBetween(10, 15)).toFixed(2);
    console.log(`[${this.id}] THROTTLED due to GRID LIMIT -> currentLimit=${this.currentLimit}A`);
  }

  unthrottle() {
    if (this.currentLimit != null) {
      this.currentLimit = null;
      console.log(`[${this.id}] UNTHROTTLED; restoring normal charging current range`);
    }
  }

  async startSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
    // If charger is already charging, reject immediately
    if (this.status === 'CHARGING') {
      console.log(`Charger ${this.id} busy; cannot start session ${sessionId}`);
      return { ok: false, error: 'CHARGER_BUSY' };
    }

    // Try to reserve the session id in DB first. If session already exists, propagate error.
    try {
      const start_ts = new Date().toISOString();
      await insertSessionStart(sessionId, this.id, start_ts);
    } catch (e) {
      if (e && (e as any).code === 'SESSION_EXISTS') {
        console.log(`Duplicate session ${sessionId} for charger ${this.id}`);
        return { ok: false, error: 'SESSION_EXISTS' };
      }
      // Unexpected DB error - rethrow to let higher layers handle it
      throw e;
    }

    // Mark charger as charging only after DB reservation succeeds
    this.status = 'CHARGING';
    this.currentSessionId = sessionId;
    console.log(`Charger ${this.id} started session ${sessionId}`);
    return { ok: true };
  }

  stopSession(reason = "USER_STOP") {
    let sessionIdToUpdate = this.currentSessionId;
    let updateReason = reason;
    if (this.status === 'CHARGING') {
      console.log(`Charger ${this.id} stopping session ${this.currentSessionId}`);
      this.status = 'AVAILABLE';
      this.currentSessionId = null;
    } else if (this.status === 'FAULTY') {
      // Recover from faulty state: clear session and mark available
      if (this.currentSessionId) {
        console.log(`Charger ${this.id} clearing session ${this.currentSessionId} while recovering from FAULTY`);
      }
      this.currentSessionId = null;
      this.status = 'AVAILABLE';
      updateReason = "FAULT_RECOVERY";
      console.log(`Charger ${this.id} recovered from FAULTY state`);
    } else {
      // AVAILABLE - nothing to do
      console.log(`Charger ${this.id} is already AVAILABLE; no session to stop`);
    }
    if (sessionIdToUpdate) {
      (async () => {
        try {
          const stop_ts = new Date().toISOString();
          const start_ts = await getSessionStartTime(sessionIdToUpdate);
          if (!start_ts) {
            console.error(`No start time found for session ${sessionIdToUpdate}`);
            return;
          }
          const startTime = new Date(start_ts);
          const stopTime = new Date(stop_ts);
          const durationMs = stopTime.getTime() - startTime.getTime();
          const duration_seconds = durationMs / 1000;
          const duration_minutes = duration_seconds / 60;
          let duration_human: string;
          if (duration_seconds < 60) {
            duration_human = `${Math.floor(duration_seconds)}s`;
          } else if (duration_seconds < 3600) {
            const min = Math.floor(duration_seconds / 60);
            const sec = Math.floor(duration_seconds % 60);
            duration_human = `${min}m ${sec}s`;
          } else {
            const hours = Math.floor(duration_seconds / 3600);
            const min = Math.floor((duration_seconds % 3600) / 60);
            const sec = Math.floor(duration_seconds % 60);
            duration_human = `${hours}h ${min}m ${sec}s`;
          }
          const bill_amount = this.meterKWh * Charger.RATE_PER_KWH;
          await updateSessionStop(sessionIdToUpdate, stop_ts, this.meterKWh, updateReason, duration_seconds, duration_minutes, duration_human, bill_amount);
        } catch (e) {
          console.error(`Failed to update session stop for ${this.id}:`, e);
        }
      })();
    }
  }
  injectFault(_faultType: string) {
    // Log the fault, set status to FAULTY and clear any current session.
    console.log(`[${this.id}] Fault injected: ${_faultType}`);
    if (this.status === 'CHARGING') {
      this.stopSession("FAULT");
    }
    this.status = 'FAULTY';
    this.currentSessionId = null;
  }

  onTelemetry(cb: (t: any) => void) {
    this.telemetryListeners.push(cb);
  }

  reset() {
    if (this.status === 'FAULTY') {
      this.status = 'AVAILABLE';
      this.currentSessionId = null;
      console.log(`[${this.id}] Reset to AVAILABLE`);
    }
    // If not FAULTY, do nothing
  }

}

export default Charger;
