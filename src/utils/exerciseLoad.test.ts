import {
  loadVolumeKg,
  normalizeSetLoad,
  resolveDefaultLoadMode,
  resolveSupportedLoadModes,
} from './exerciseLoad';

describe('exercise load compatibility', () => {
  it('keeps legacy exercises and sets as external weight', () => {
    expect(resolveSupportedLoadModes({})).toEqual(['external_weight']);
    expect(resolveDefaultLoadMode({})).toBe('external_weight');
    expect(normalizeSetLoad({ weight: 42.5 }, {})).toEqual({
      loadMode: 'external_weight',
      externalWeightKg: 42.5,
      additionalWeightKg: 0,
      weight: 42.5,
    });
  });

  it('stores pure bodyweight without inventing an external load', () => {
    const load = normalizeSetLoad(
      { loadMode: 'bodyweight', weight: 90 },
      { supportedLoadModes: ['bodyweight', 'bodyweight_plus_weight'], defaultLoadMode: 'bodyweight' }
    );
    expect(load).toEqual({ loadMode: 'bodyweight', externalWeightKg: 0, additionalWeightKg: 0, weight: 0 });
    expect(loadVolumeKg(load)).toBe(0);
  });

  it('keeps added bodyweight load separate and supports decimals', () => {
    const load = normalizeSetLoad(
      { loadMode: 'bodyweight_plus_weight', additionalWeightKg: 2.5 },
      { supportedLoadModes: ['bodyweight', 'bodyweight_plus_weight'] }
    );
    expect(load).toEqual({ loadMode: 'bodyweight_plus_weight', externalWeightKg: 0, additionalWeightKg: 2.5, weight: 2.5 });
    expect(loadVolumeKg(load)).toBe(2.5);
  });

  it('rejects an unsupported mode and invalid additional weight', () => {
    expect(() => normalizeSetLoad({ loadMode: 'bodyweight' }, { supportedLoadModes: ['external_weight'] })).toThrow(/not supported/);
    expect(() => normalizeSetLoad(
      { loadMode: 'bodyweight_plus_weight', additionalWeightKg: 0 },
      { supportedLoadModes: ['bodyweight_plus_weight'] }
    )).toThrow(/greater than 0/);
  });
});
