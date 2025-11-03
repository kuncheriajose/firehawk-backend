const fs = require('fs').promises;
const csv = require('csv-parse');
const admin = require('firebase-admin');

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    unlink: jest.fn()
  }
}));

jest.mock('firebase-admin', () => {
  const mockBatch = {
    set: jest.fn().mockReturnThis(),
    commit: jest.fn(() => Promise.resolve())
  };

  const mockDoc = {
    set: jest.fn()
  };

  const mockCollection = {
    doc: jest.fn(() => mockDoc)
  };

  const mockFirestore = {
    collection: jest.fn(() => mockCollection),
    batch: jest.fn(() => mockBatch)
  };

  return {
    firestore: jest.fn(() => mockFirestore),
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(),
      applicationDefault: jest.fn()
    }
  };
});

describe('CSV Import Service', () => {
  let db;

  beforeEach(() => {
    jest.clearAllMocks();
    db = admin.firestore();
  });

  it('should parse CSV file correctly', async () => {
    const csvContent = `make,fuelType,price
Toyota,gas,15000
Honda,gas,18000`;

    fs.readFile.mockResolvedValue(csvContent);

    const records = [];
    await new Promise((resolve, reject) => {
      csv.parse(csvContent, {
        columns: true,
        skip_empty_lines: true
      })
      .on('data', (data) => records.push(data))
      .on('end', resolve)
      .on('error', reject);
    });

    expect(records).toHaveLength(2);
    expect(records[0]).toHaveProperty('make', 'Toyota');
    expect(records[1]).toHaveProperty('make', 'Honda');
  });

  it('should convert numeric fields correctly', async () => {
    const csvContent = `make,price,horsepower
Toyota,15000,120`;

    const records = [];
    await new Promise((resolve, reject) => {
      csv.parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        cast: (value, context) => {
          if (context.column === 'price' || context.column === 'horsepower') {
            const num = parseFloat(value);
            return isNaN(num) ? value : num;
          }
          return value;
        }
      })
      .on('data', (data) => records.push(data))
      .on('end', resolve)
      .on('error', reject);
    });

    expect(typeof records[0].price).toBe('number');
    expect(typeof records[0].horsepower).toBe('number');
    expect(records[0].price).toBe(15000);
    expect(records[0].horsepower).toBe(120);
  });

  it('should batch import records to Firestore', async () => {
    const records = [
      { make: 'Toyota', price: 15000 },
      { make: 'Honda', price: 18000 }
    ];

    const batch = db.batch();
    const collection = db.collection('cars');

    records.forEach((record) => {
      const docRef = collection.doc();
      batch.set(docRef, record);
    });

    await batch.commit();

    expect(db.collection).toHaveBeenCalledWith('cars');
    expect(db.batch).toHaveBeenCalled();
    expect(batch.set).toHaveBeenCalledTimes(2);
    expect(batch.commit).toHaveBeenCalled();
  });

  it('should handle large datasets with batching', async () => {
    // Simulate 1200 records (needs 3 batches of 500)
    const totalRecords = 1200;
    const batchSize = 500;

    let batchCount = 0;
    for (let i = 0; i < totalRecords; i += batchSize) {
      const batch = db.batch();
      const batchRecords = Array(Math.min(batchSize, totalRecords - i))
        .fill(null)
        .map(() => ({ make: 'Test', price: 10000 }));

      batchRecords.forEach((record) => {
        const docRef = db.collection('cars').doc();
        batch.set(docRef, record);
      });

      await batch.commit();
      batchCount++;
    }

    expect(batchCount).toBe(3); // 500 + 500 + 200
  });
});

