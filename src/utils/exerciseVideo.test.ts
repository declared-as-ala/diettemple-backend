import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { serializeExerciseVideosDeep } from './exerciseVideo';

describe('serializeExerciseVideosDeep keeps ids and dates intact', () => {
  it('ObjectIds stay 24-char hex strings in the JSON and Dates stay ISO strings (they used to become {buffer:…} and {})', () => {
    const exId = new mongoose.Types.ObjectId();
    const altId = new mongoose.Types.ObjectId();
    const when = new Date('2026-10-06T10:00:00Z');
    const payload = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Push',
      createdAt: when,
      exerciseConfigs: [
        {
          _id: new mongoose.Types.ObjectId(),
          clientInstruction: 'tapis 5 min',
          exerciseId: { _id: exId, name: 'Chest Press', videoUrl: '/media/a.mp4' },
          alternatives: [{ _id: altId, name: 'Flat Dumbell Press', videoUrl: '/media/b.mp4' }],
        },
      ],
    };
    const json = JSON.parse(JSON.stringify(serializeExerciseVideosDeep(payload)));
    expect(json.exerciseConfigs[0].exerciseId._id).toBe(String(exId));
    expect(json.exerciseConfigs[0].alternatives[0]._id).toBe(String(altId));
    expect(json.exerciseConfigs[0].exerciseId._id).toMatch(/^[0-9a-f]{24}$/);
    expect(json.createdAt).toBe('2026-10-06T10:00:00.000Z');
    expect(json.exerciseConfigs[0].clientInstruction).toBe('tapis 5 min'); // coach message untouched
    expect(json.exerciseConfigs[0].exerciseId.name).toBe('Chest Press');
  });
});
