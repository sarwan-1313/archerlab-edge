/**
 * Heart rate from a Bluetooth chest strap or watch that broadcasts the
 * standard Heart Rate service, read in the browser with Web Bluetooth
 * (Chrome on Android, desktop Chrome and Edge). Nothing is sent anywhere.
 */

export const HEART_RATE_SERVICE = 0x180d;
export const HEART_RATE_MEASUREMENT = 0x2a37;

/** Reads beats per minute from a Heart Rate Measurement value (flags bit 0: 16-bit value). */
export function parseHeartRate(value: DataView): number | null {
  if (value.byteLength < 2) return null;
  const flags = value.getUint8(0);
  if (flags & 0x01) return value.byteLength >= 3 ? value.getUint16(1, true) : null;
  return value.getUint8(1);
}

export function heartRateSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

interface Characteristic extends EventTarget { value?: DataView; startNotifications(): Promise<unknown>; stopNotifications?(): Promise<unknown> }
interface BluetoothApi {
  requestDevice(options: { filters: Array<{ services: number[] }> }): Promise<{ name?: string; gatt?: { connect(): Promise<{ disconnect(): void; getPrimaryService(id: number): Promise<{ getCharacteristic(id: number): Promise<Characteristic> }> }> }; addEventListener(type: string, listener: () => void): void }>;
}

export interface HeartRateConnection { name: string; disconnect(): void }

/** Opens the browser's device picker, then calls onBpm for every reading. Call it from a button press. */
export async function connectHeartRate(onBpm: (bpm: number) => void, onDisconnect: () => void): Promise<HeartRateConnection> {
  const bluetooth = (navigator as unknown as { bluetooth?: BluetoothApi }).bluetooth;
  if (!bluetooth) throw new Error('This browser cannot connect to Bluetooth heart-rate monitors. Try Chrome on Android or a desktop computer.');
  const device = await bluetooth.requestDevice({ filters: [{ services: [HEART_RATE_SERVICE] }] });
  if (!device.gatt) throw new Error('That device cannot be connected.');
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(HEART_RATE_SERVICE);
  const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
  const listener = () => {
    const bpm = characteristic.value ? parseHeartRate(characteristic.value) : null;
    if (bpm !== null && bpm > 20 && bpm < 250) onBpm(bpm);
  };
  characteristic.addEventListener('characteristicvaluechanged', listener);
  device.addEventListener('gattserverdisconnected', onDisconnect);
  await characteristic.startNotifications();
  return {
    name: device.name ?? 'Heart-rate monitor',
    disconnect: () => {
      characteristic.removeEventListener('characteristicvaluechanged', listener);
      server.disconnect();
    },
  };
}

export interface HeartRateSummary { mean: number; min: number; max: number; count: number }

export function summariseHeartRate(values: ReadonlyArray<number | null | undefined>): HeartRateSummary | null {
  const list = values.filter((value): value is number => typeof value === 'number');
  if (!list.length) return null;
  return { mean: list.reduce((sum, value) => sum + value, 0) / list.length, min: Math.min(...list), max: Math.max(...list), count: list.length };
}
