import { describe, it, expect } from '@jest/globals';
import { LADDER, buildMasterPlaylist, buildMp4Args, buildHlsArgs, contentTypeFor, parseProbe, scaleFilter, selectRungs } from './videoTranscode';

describe('video ladder', () => {
  it('never upscales: keeps rungs that fit the source, always at least the smallest', () => {
    expect(selectRungs(1080, 1920).map((r) => r.key)).toEqual(['240', '360', '540']);
    expect(selectRungs(1920, 1080).map((r) => r.key)).toEqual(['240', '360', '540']); // landscape
    expect(selectRungs(480, 640).map((r) => r.key)).toEqual(['240', '360']);
    expect(selectRungs(200, 200).map((r) => r.key)).toEqual(['240']);
  });
  it('bitrate budget: top rung stays under 1 Mbps incl. audio so a 1 Mbps link can play it', () => {
    for (const r of LADDER) expect(r.maxrateK + 48).toBeLessThan(1000);
    expect(LADDER[0].maxrateK).toBeLessThanOrEqual(350); // lowest rung usable on very slow links
  });
  it('scale filter is orientation independent and keeps even dimensions', () => {
    expect(scaleFilter(640)).toContain("if(gt(iw,ih),640,-2)");
    expect(scaleFilter(640)).toContain("if(gt(iw,ih),-2,640)");
  });
});

describe('ffmpeg arguments', () => {
  const args = buildMp4Args('in.mp4', 'out.mp4', LADDER[1], true);
  it('H.264 main + yuv420p + faststart + fixed 2 s GOP (clean looping / HLS cuts)', () => {
    const j = args.join(' ');
    expect(j).toContain('-c:v libx264');
    expect(j).toContain('-profile:v main');
    expect(j).toContain('-pix_fmt yuv420p');
    expect(j).toContain('-movflags +faststart');
    expect(j).toContain('-g 60 -keyint_min 60 -sc_threshold 0');
    expect(args[args.length - 1]).toBe('out.mp4');
  });
  it('mono 48 kbps AAC when there is audio, none otherwise', () => {
    expect(args.join(' ')).toContain('-c:a aac -b:a 48k -ac 1');
    expect(buildMp4Args('in.mp4', 'o.mp4', LADDER[0], false)).toContain('-an');
  });
  it('HLS is cut from the existing encode (stream copy, no second encode), VOD, 2 s segments', () => {
    const j = buildHlsArgs('v360.mp4', 'i.m3u8', 's_%03d.ts').join(' ');
    expect(j).toContain('-c copy');
    expect(j).toContain('-hls_time 2');
    expect(j).toContain('-hls_playlist_type vod');
  });
});

describe('HLS master playlist', () => {
  const pl = buildMasterPlaylist([
    { key: '540', width: 540, height: 960, bitrateKbps: 637 },
    { key: '240', width: 240, height: 426, bitrateKbps: 183 },
    { key: '360', width: 360, height: 640, bitrateKbps: 346 },
  ]);
  it('lists variants low -> high with PEAK bandwidth, resolution and codecs', () => {
    expect(pl.startsWith('#EXTM3U')).toBe(true);
    const bw = [...pl.matchAll(/STREAM-INF:BANDWIDTH=(\d+),/g)].map((m) => Number(m[1]));
    expect(bw).toEqual([278000, 528000, 948000]); // maxrate + 48 kbps audio
    expect([...pl.matchAll(/^(\d+)\/index\.m3u8$/gm)].map((m) => m[1])).toEqual(['240', '360', '540']);
    expect(pl).toContain('CODECS="avc1.4d401f,mp4a.40.2"');
    expect(pl).toContain('RESOLUTION=360x640');
  });
});

describe('probe + content types', () => {
  it('parses ffprobe json', () => {
    const p = parseProbe({ streams: [{ codec_type: 'video', codec_name: 'hevc', width: 1080, height: 1920 }, { codec_type: 'audio' }], format: { duration: '9.75', bit_rate: '6934322' } }, 8452935);
    expect(p).toMatchObject({ codec: 'hevc', width: 1080, height: 1920, bitrateKbps: 6934, hasAudio: true, bytes: 8452935 });
    expect(p.durationSec).toBeCloseTo(9.75);
  });
  it('rejects a file with no video stream', () => {
    expect(() => parseProbe({ streams: [{ codec_type: 'audio' }] }, 10)).toThrow(/No video stream/);
  });
  it('correct MIME for HLS manifests, segments, mp4 and poster', () => {
    expect(contentTypeFor('a/master.m3u8')).toBe('application/vnd.apple.mpegurl');
    expect(contentTypeFor('seg_001.ts')).toBe('video/mp2t');
    expect(contentTypeFor('v360.mp4')).toBe('video/mp4');
    expect(contentTypeFor('poster.jpg')).toBe('image/jpeg');
  });
});
