#!/usr/bin/env node

/**
 * Script to import automobile dataset CSV to Firestore
 * Usage: node scripts/import-data.js path/to/dataset.csv
 */

const admin = require('firebase-admin');
const csv = require('csv-parse');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Initialize Firebase Admin
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const serviceAccount = require(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

const db = admin.firestore();

async function importCsv(csvFilePath) {
  try {
    console.log(`Reading CSV file: ${csvFilePath}`);
    const fileContent = await fs.readFile(csvFilePath, 'utf-8');

    const records = [];
    await new Promise((resolve, reject) => {
      csv.parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: (value, context) => {
          // Convert numeric fields
          const numericFields = [
            'symboling', 'normalizedLosses', 'wheelBase', 'length', 'width',
            'height', 'curbWeight', 'engineSize', 'bore', 'stroke',
            'compressionRatio', 'horsepower', 'peakRpm', 'cityMpg',
            'highwayMpg', 'price'
          ];
          
          if (numericFields.includes(context.column)) {
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

    console.log(`Parsed ${records.length} records`);

    // Batch import to Firestore
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
      console.log(`Imported ${importedCount}/${records.length} records...`);
    }

    console.log(`✅ Successfully imported ${importedCount} cars to Firestore!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error importing data:', error);
    process.exit(1);
  }
}

// Get CSV file path from command line arguments
const csvFilePath = process.argv[2];

if (!csvFilePath) {
  console.error('Usage: node scripts/import-data.js <path-to-csv-file>');
  process.exit(1);
}

importCsv(csvFilePath);

