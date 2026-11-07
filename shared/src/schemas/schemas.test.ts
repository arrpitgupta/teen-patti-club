import { describe, expect, it } from 'vitest';
import { defaultSettings, SettingsSchema } from '../games/teenPatti/settings';
import { ClientEventSchemas, GameCodeSchema, parseClientEvent } from './socket';

describe('settings schema', () => {
  it('defaults are valid in both modes', () => {
    expect(SettingsSchema.safeParse(defaultSettings('digital')).success).toBe(true);
    expect(SettingsSchema.safeParse(defaultSettings('physical')).success).toBe(true);
  });

  it('turn timer defaults to 45 s in digital mode and off in physical mode', () => {
    expect(defaultSettings('digital').turnTimerSec).toBe(45);
    expect(defaultSettings('physical').turnTimerSec).toBeNull();
  });

  it('open tab must start at 0 chips', () => {
    const s = { ...defaultSettings(), chipMode: 'openTab', startingChips: 500 };
    expect(SettingsSchema.safeParse(s).success).toBe(false);
  });

  it('buy-in must start with at least the boot', () => {
    const base = { ...defaultSettings(), chipMode: 'buyIn' };
    expect(SettingsSchema.safeParse({ ...base, startingChips: 0 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...base, startingChips: 5 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...base, startingChips: 1000 }).success).toBe(true);
  });

  it('max chaal and pot limit cannot be below the boot', () => {
    expect(SettingsSchema.safeParse({ ...defaultSettings(), maxChaal: 5 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...defaultSettings(), potLimit: 5 }).success).toBe(false);
  });

  it('"no limit" is null', () => {
    const s = { ...defaultSettings(), maxChaal: null, potLimit: null, maxBlinds: null };
    expect(SettingsSchema.safeParse(s).success).toBe(true);
  });
});

describe('socket payload schemas', () => {
  it('game codes are 6 characters without look-alike letters', () => {
    expect(GameCodeSchema.safeParse('ABC234').success).toBe(true);
    expect(GameCodeSchema.safeParse('ABC23').success).toBe(false);
    expect(GameCodeSchema.safeParse('ABCO12').success).toBe(false);
  });

  it('chaal needs a positive whole amount', () => {
    const s = ClientEventSchemas['action:chaal'];
    expect(s.safeParse({ amount: 40 }).success).toBe(true);
    expect(s.safeParse({ amount: 0 }).success).toBe(false);
    expect(s.safeParse({ amount: 12.5 }).success).toBe(false);
    expect(s.safeParse({ amount: '40' }).success).toBe(false);
  });

  it('rejects unknown extra fields', () => {
    expect(ClientEventSchemas['action:pack'].safeParse({ hack: true }).success).toBe(false);
  });

  it('enter cards needs exactly 3 valid cards', () => {
    const s = ClientEventSchemas['result:enterCards'];
    expect(s.safeParse({ cards: ['As', 'Kd', '2c'] }).success).toBe(true);
    expect(s.safeParse({ cards: ['As', 'Kd'] }).success).toBe(false);
    expect(s.safeParse({ cards: ['As', 'Kd', 'ZZ'] }).success).toBe(false);
  });

  it('chip adjustment needs a reason', () => {
    const s = ClientEventSchemas['host:adjustChips'];
    expect(s.safeParse({ from: 'a', to: 'b', amount: 10, reason: 'miscount' }).success).toBe(true);
    expect(s.safeParse({ from: 'a', to: 'b', amount: 10, reason: '  ' }).success).toBe(false);
  });

  it('parseClientEvent validates by event name', () => {
    expect(parseClientEvent('action:chaal', { amount: 20 })).toEqual({
      ok: true,
      data: { amount: 20 },
    });
    expect(parseClientEvent('action:chaal', { amount: -1 }).ok).toBe(false);
    expect(parseClientEvent('nope', {}).ok).toBe(false);
  });
});
