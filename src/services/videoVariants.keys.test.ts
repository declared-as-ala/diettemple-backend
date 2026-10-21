jest.mock('../lib/minioClient', () => ({ minioClient: {}, BUCKETS: { VIDEOS: 'videos', MEDIA: 'media' } }));
jest.mock('../models/Exercise.model', () => ({ __esModule: true, default: {} }));
jest.mock('../models/LevelHomeContent.model', () => ({ __esModule: true, default: {} }));
import { describe, it, expect } from '@jest/globals';
import { objectKeyFromVideo } from './videoVariants.service';

describe('objectKeyFromVideo', () => {
  it('maps every stored shape to the MinIO key', () => {
    expect(objectKeyFromVideo('exercises/abc/video_1.mp4', null)).toBe('exercises/abc/video_1.mp4');
    expect(objectKeyFromVideo(null, '/videos/exercises/abc/video_1.mp4')).toBe('exercises/abc/video_1.mp4');
    expect(objectKeyFromVideo(null, '/api/videos/exercises/abc/video_1.mp4')).toBe('exercises/abc/video_1.mp4');
    expect(objectKeyFromVideo(null, 'https://api.diettemple.tn/videos/level-home/intiate/v.mp4')).toBe('level-home/intiate/v.mp4');
  });
  it('ignores YouTube / non-video / empty values', () => {
    expect(objectKeyFromVideo(null, 'https://youtu.be/xyz')).toBeNull();
    expect(objectKeyFromVideo(null, '/videos/exercises/abc/poster.jpg')).toBeNull();
    expect(objectKeyFromVideo('', '')).toBeNull();
  });
});
