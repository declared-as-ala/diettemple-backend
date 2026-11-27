import { MAX_AUDIO_SECONDS, clampDuration, parseRange, sniffAudio, validateAudio, AudioError } from './audio';

const pad = (head: Buffer, n = 32) => Buffer.concat([head, Buffer.alloc(n, 1)]);

describe('audio sniffing (real type from bytes)', () => {
  it('recognises the formats browsers and phones record', () => {
    expect(sniffAudio(pad(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))?.mime).toBe('audio/webm');
    expect(sniffAudio(pad(Buffer.from('OggS')))?.mime).toBe('audio/ogg');
    expect(sniffAudio(pad(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A ')])))?.mime).toBe('audio/mp4');
    expect(sniffAudio(pad(Buffer.from('ID3')))?.mime).toBe('audio/mpeg');
    expect(sniffAudio(pad(Buffer.from([0xff, 0xfb, 0x90, 0x00])))?.mime).toBe('audio/mpeg');
    expect(sniffAudio(pad(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])))?.mime).toBe('audio/wav');
  });

  it('rejects scripts, images, executables and tiny files whatever they are named', () => {
    expect(sniffAudio(Buffer.from('<?php system($_GET[1]); ?>'))).toBeNull();
    expect(sniffAudio(pad(Buffer.from([0x89, 0x50, 0x4e, 0x47])))).toBeNull();
    expect(sniffAudio(pad(Buffer.from('MZ')))).toBeNull();
    expect(sniffAudio(Buffer.alloc(4))).toBeNull();
  });

  it('validateAudio: random private key, size limit, empty file', () => {
    const ok = validateAudio('voice/c/e', { buffer: pad(Buffer.from('OggS')), size: 36, originalname: '../../x.mp3' });
    expect(ok.key).toMatch(/^voice\/c\/e\/[0-9a-f]{32}\.ogg$/);
    expect(() => validateAudio('p', { buffer: Buffer.alloc(0), size: 0 })).toThrow(AudioError);
    expect(() => validateAudio('p', { buffer: Buffer.concat([Buffer.from('OggS'), Buffer.alloc(8 * 1024 * 1024)]), size: 1 })).toThrow(/8 Mo/);
    expect(() => validateAudio('p', { buffer: Buffer.from('hello world, not audio'), size: 22 })).toThrow(/Format/);
  });

  it('clampDuration never trusts the client', () => {
    expect(clampDuration('12.4')).toBe(12);
    expect(clampDuration(-5)).toBe(0);
    expect(clampDuration('abc')).toBe(0);
    expect(clampDuration(999999)).toBe(MAX_AUDIO_SECONDS);
  });
});

describe('HTTP Range parsing', () => {
  it('handles absent, normal, open-ended and suffix ranges', () => {
    expect(parseRange(undefined, 1000)).toBeNull();
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('flags unsatisfiable or malformed ranges', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('invalid');
    expect(parseRange('bytes=50-10', 1000)).toBe('invalid');
    expect(parseRange('bytes=-0', 1000)).toBe('invalid');
    expect(parseRange('bytes=-', 1000)).toBe('invalid');
    expect(parseRange('items=0-5', 1000)).toBe('invalid');
    expect(parseRange('bytes=0-5,10-20', 1000)).toBe('invalid');
  });
});
