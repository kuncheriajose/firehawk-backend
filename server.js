const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const multer = require('multer');
const csv = require('csv-parse');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Firebase Admin
let db;
try {
  // For production, use service account from environment
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    // For local development, use application default credentials or service account path
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  }
  db = admin.firestore();
  console.log('Firestore initialized successfully');
} catch (error) {
  console.error('Error initializing Firestore:', error);
  // Continue without Firestore if it fails (for testing)
}

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Import CSV data to Firestore
app.post('/api/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!db) {
      return res.status(500).json({ error: 'Firestore not initialized' });
    }

    const filePath = req.file.path;
    const fileContent = await fs.readFile(filePath, 'utf-8');

    // Parse CSV
    const records = [];
    await new Promise((resolve, reject) => {
      csv.parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: (value, context) => {
          // Try to convert numeric fields
          if (context.column === 'symboling' || 
              context.column === 'normalizedLosses' ||
              context.column === 'wheelBase' ||
              context.column === 'length' ||
              context.column === 'width' ||
              context.column === 'height' ||
              context.column === 'curbWeight' ||
              context.column === 'engineSize' ||
              context.column === 'bore' ||
              context.column === 'stroke' ||
              context.column === 'compressionRatio' ||
              context.column === 'horsepower' ||
              context.column === 'peakRpm' ||
              context.column === 'cityMpg' ||
              context.column === 'highwayMpg' ||
              context.column === 'price') {
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

    // Batch import to Firestore (500 records per batch)
    const batchSize = 500;
    let importedCount = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = db.batch();
      const batchRecords = records.slice(i, i + batchSize);

      batchRecords.forEach((record) => {
        const docRef = db.collection('cars').doc();
        batch.set(docRef, record);
      });

      await batch.commit();
      importedCount += batchRecords.length;
    }

    // Clean up uploaded file
    await fs.unlink(filePath);

    res.json({
      success: true,
      message: `Successfully imported ${importedCount} cars to Firestore`,
      count: importedCount
    });
  } catch (error) {
    console.error('Error importing data:', error);
    res.status(500).json({ error: 'Failed to import data', details: error.message });
  }
});

// Get cars count from Firestore
app.get('/api/stats', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Firestore not initialized' });
    }

    const snapshot = await db.collection('cars').count().get();
    const count = snapshot.data().count;

    res.json({
      success: true,
      count: count
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats', details: error.message });
  }
});

// Delete all cars (useful for testing/resetting)
app.delete('/api/cars', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Firestore not initialized' });
    }

    const snapshot = await db.collection('cars').get();
    const batch = db.batch();
    
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    res.json({
      success: true,
      message: `Deleted ${snapshot.size} cars from Firestore`,
      count: snapshot.size
    });
  } catch (error) {
    console.error('Error deleting cars:', error);
    res.status(500).json({ error: 'Failed to delete cars', details: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;

