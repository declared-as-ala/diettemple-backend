import { AttachmentError, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, sniffImage, validateAttachments } from './attachments';
import { serializeForAdmin, serializeForClient } from './complaint.service';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);
const file = (buffer: Buffer, name = 'a.png') => ({ originalname: name, buffer, size: buffer.length });

describe('attachment validation', () => {
  it('detects the real image type from the bytes, whatever the file name says', () => {
    expect(sniffImage(PNG)?.mime).toBe('image/png');
    expect(sniffImage(JPG)?.mime).toBe('image/jpeg');
    expect(sniffImage(WEBP)?.mime).toBe('image/webp');
    expect(sniffImage(Buffer.from('<?php echo 1;'))).toBeNull();
    expect(sniffImage(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });

  it('rejects disguised files, empty files, huge files and too many files', () => {
    expect(() => validateAttachments('p', [file(Buffer.from('not an image'), 'evil.png')])).toThrow(AttachmentError);
    expect(() => validateAttachments('p', [file(Buffer.alloc(0))])).toThrow(/vide/);
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_ATTACHMENT_BYTES)]);
    expect(() => validateAttachments('p', [file(big)])).toThrow(/trop lourde/);
    expect(() => validateAttachments('p', Array.from({ length: MAX_ATTACHMENTS + 1 }, () => file(PNG)))).toThrow(/Maximum/);
  });

  it('stores under a random, non-guessable key with a safe name and the sniffed type', () => {
    const [a, b] = validateAttachments('complaints/abc', [file(PNG, '../../etc/passwd.png'), file(JPG, 'photo.jpeg')]);
    expect(a.key).toMatch(/^complaints\/abc\/[0-9a-f]{32}\.png$/);
    expect(a.key).not.toBe(b.key);
    expect(a.name).not.toContain('/');
    expect(b.mime).toBe('image/jpeg');
    expect(validateAttachments('p', undefined)).toEqual([]);
  });
});

describe('complaint serializers (what each side may see)', () => {
  const complaint: any = {
    _id: 'c1', reference: 'REC-AAAA1111', userId: 'u1', category: 'billing', subject: 'Paiement refusé', status: 'in_progress', priority: 'high',
    unreadForClient: 2, unreadForAdmin: 5, createdAt: new Date(), lastMessageAt: new Date(),
    messages: [
      { _id: 'm1', authorType: 'client', authorId: 'u1', body: 'Bonjour mon paiement échoue', internal: false, createdAt: new Date(), attachments: [{ _id: 'a1', key: 'complaints/c1/SECRETKEY.png', name: 'x.png', mime: 'image/png', size: 10 }] },
      { _id: 'm2', authorType: 'admin', authorId: 'adm', body: 'NOTE INTERNE: client suspect, ne pas rembourser', internal: true, createdAt: new Date(), attachments: [] },
      { _id: 'm3', authorType: 'admin', authorId: 'adm', body: 'Nous regardons cela', internal: false, createdAt: new Date(), attachments: [] },
    ],
  };

  it('the client view hides internal notes, storage keys, admin ids and the priority', () => {
    const out = serializeForClient(complaint);
    const json = JSON.stringify(out);
    expect(out.messages).toHaveLength(2);
    expect(json).not.toContain('NOTE INTERNE');
    expect(json).not.toContain('SECRETKEY');
    expect(json).not.toContain('authorId');
    expect(json).not.toContain('"internal"');
    expect(json).not.toContain('priority');
    expect(out.unread).toBe(2);
    expect(out.statusLabel).toBe('En cours de traitement');
    expect(out.categoryLabel).toBe('Abonnement et paiement');
    expect(out.lastMessagePreview).toBe('Nous regardons cela');
  });

  it('the admin view includes internal notes (flagged), priority and the client profile — still no storage keys', () => {
    const out = serializeForAdmin(complaint, { _id: 'u1', name: 'Sami', email: 's@x.com' });
    expect(out.messages).toHaveLength(3);
    expect(out.messages[1].internal).toBe(true);
    expect(out.priority).toBe('high');
    expect(out.unread).toBe(5);
    expect(out.client).toMatchObject({ id: 'u1', name: 'Sami', email: 's@x.com' });
    expect(JSON.stringify(out)).not.toContain('SECRETKEY');
  });
});
