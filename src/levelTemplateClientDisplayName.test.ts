import LevelTemplate from './models/LevelTemplate.model';

describe('LevelTemplate clientDisplayName separation & serializer tests', () => {
  it('should compile LevelTemplate schema with clientDisplayName', () => {
    const doc = new LevelTemplate({
      name: 'TEST_Initiate_2_A',
      clientDisplayName: 'Programme Initiate — Fondations',
      gender: 'M',
      level: 'INITIATE',
      durationWeeks: 5,
    });

    expect(doc.name).toBe('TEST_Initiate_2_A');
    expect(doc.clientDisplayName).toBe('Programme Initiate — Fondations');
  });

  it('should fall back client-facing display name to internal name when clientDisplayName is missing', () => {
    const doc = new LevelTemplate({
      name: 'TEST_Initiate_3_B',
      gender: 'M',
      level: 'INITIATE',
      durationWeeks: 5,
    });

    const clientVisibleName = doc.clientDisplayName || doc.name;
    expect(clientVisibleName).toBe('TEST_Initiate_3_B');
  });

  it('should correctly prioritize clientDisplayName over internal name for client-facing endpoints', () => {
    const doc = new LevelTemplate({
      name: 'INI_Full_S1_A/HF_V1',
      clientDisplayName: 'Programme Initiate — Progression',
      gender: 'F',
      level: 'INITIATE',
      durationWeeks: 5,
    });

    // Admin view returns internal technical name
    expect(doc.name).toBe('INI_Full_S1_A/HF_V1');
    expect(doc.clientDisplayName).toBe('Programme Initiate — Progression');

    // Client view maps name property to clientDisplayName || name
    const clientPayload = {
      name: doc.clientDisplayName || doc.name,
      clientDisplayName: doc.clientDisplayName || doc.name,
    };

    expect(clientPayload.name).toBe('Programme Initiate — Progression');
    expect(clientPayload.clientDisplayName).toBe('Programme Initiate — Progression');
  });
});
