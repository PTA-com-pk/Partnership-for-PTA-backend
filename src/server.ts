import cors from 'cors';
import express from 'express';
import { config as loadEnv } from 'dotenv';
import fs from 'fs';
import path from 'path';

const rootDir = path.resolve(__dirname, '../../');
const envPaths = [
  path.join(rootDir, 'backend', '.env.local'),
  path.join(rootDir, 'backend', '.env'),
  path.join(rootDir, '.env.local'),
  path.join(rootDir, '.env'),
];

envPaths.forEach((envPath) => {
  if (fs.existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
});

import {
  debugGoogleSheet,
  loadDataFromSheets,
  saveDataToSheets,
  Transaction,
} from '../lib/googleSheets';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/transactions', async (_req, res) => {
  try {
    const data = await loadDataFromSheets();
    res.json(data);
  } catch (error) {
    console.error('Failed to load transactions:', error);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});

app.post('/transactions', async (req, res) => {
  try {
    const data = await loadDataFromSheets();
    const now = new Date();

    const transaction: Transaction = {
      ...req.body,
      id: data.nextId++,
      deleted: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdTimestamp: now.getTime(),
      updatedTimestamp: now.getTime(),
    };

    data.transactions.push(transaction);
    data.lastUpdated = now.toISOString();

    const saved = await saveDataToSheets(data);

    if (!saved) {
      return res.status(500).json({ error: 'Failed to persist transaction' });
    }

    res.status(201).json({ message: 'Transaction added successfully', transaction });
  } catch (error) {
    console.error('Failed to add transaction:', error);
    res.status(500).json({ error: 'Failed to add transaction' });
  }
});

app.put('/transactions/:id', async (req, res) => {
  try {
    const data = await loadDataFromSheets();
    const transaction = data.transactions.find((t: Transaction) => t.id === Number(req.params.id));

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const now = new Date();
    Object.assign(transaction, req.body);
    transaction.updatedAt = now.toISOString();
    transaction.updatedTimestamp = now.getTime();
    data.lastUpdated = now.toISOString();

    const saved = await saveDataToSheets(data);
    if (!saved) {
      return res.status(500).json({ error: 'Failed to persist transaction update' });
    }

    res.json({ message: 'Transaction updated successfully', transaction });
  } catch (error) {
    console.error('Failed to update transaction:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

app.delete('/transactions/:id', async (req, res) => {
  try {
    const data = await loadDataFromSheets();
    const transaction = data.transactions.find((t: Transaction) => t.id === Number(req.params.id));

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const now = new Date();
    transaction.deleted = true;
    transaction.updatedAt = now.toISOString();
    transaction.updatedTimestamp = now.getTime();
    data.lastUpdated = now.toISOString();

    const saved = await saveDataToSheets(data);
    if (!saved) {
      return res.status(500).json({ error: 'Failed to persist transaction deletion' });
    }

    res.json({ message: 'Transaction marked as deleted', transaction });
  } catch (error) {
    console.error('Failed to delete transaction:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

app.post('/debug', async (_req, res) => {
  try {
    await debugGoogleSheet();
    res.json({ message: 'Debug triggered' });
  } catch (error) {
    console.error('Debug command failed:', error);
    res.status(500).json({ error: 'Debug command failed' });
  }
});

const PORT = Number(process.env.PORT) || 4000;

app.listen(PORT, () => {
  console.log(`Partnership Ledger backend is running on port ${PORT}`);
});

