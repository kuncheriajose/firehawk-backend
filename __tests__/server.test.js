const request = require('supertest');
const admin = require('firebase-admin');

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
        delete: jest.fn()
      })),
      count: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({
          data: () => ({ count: 10 })
        }))
      })),
      get: jest.fn(() => Promise.resolve({
        size: 10,
        docs: Array(10).fill(null).map((_, i) => ({
          ref: { id: `car${i}` }
        }))
      }))
    })),
    batch: jest.fn(() => ({
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      commit: jest.fn(() => Promise.resolve())
    }))
  };

  return {
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(),
      applicationDefault: jest.fn()
    },
    firestore: jest.fn(() => mockFirestore)
  };
});

// Load app after mocking
const app = require('../server');

describe('Backend Server', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/stats', () => {
    it('should return car count from Firestore', async () => {
      // Mock Firestore to return count
      const mockDb = admin.firestore();
      
      const response = await request(app)
        .get('/api/stats')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('count');
    });
  });

  describe('POST /api/import', () => {
    it('should return 400 if no file is uploaded', async () => {
      const response = await request(app)
        .post('/api/import')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('No file uploaded');
    });
  });

  describe('DELETE /api/cars', () => {
    it('should delete all cars from Firestore', async () => {
      const mockDb = admin.firestore();
      
      const response = await request(app)
        .delete('/api/cars')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('count');
    });
  });
});

