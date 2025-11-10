import { google } from 'googleapis';

// Initialize Google Sheets API
const sheets = google.sheets({ version: 'v4' });

// Your Google Sheet ID (you'll need to replace this with your actual sheet ID)
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '';

// Service account credentials (you'll need to set these up)
function getCredentials() {
  // Handle private key formatting for different environments
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  
  if (privateKey) {
    // Replace escaped newlines with actual newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
    
    // Ensure the private key has proper formatting
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----\n`;
    }
  }

  return {
    type: 'service_account',
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: privateKey,
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.GOOGLE_CLIENT_EMAIL}`,
  };
}

// Validate credentials
function validateCredentials() {
  if (!process.env.GOOGLE_SHEET_ID) {
    console.log('GOOGLE_SHEET_ID not set');
    return false;
  }
  if (!process.env.GOOGLE_CLIENT_EMAIL) {
    console.log('GOOGLE_CLIENT_EMAIL not set');
    return false;
  }
  if (!process.env.GOOGLE_PRIVATE_KEY) {
    console.log('GOOGLE_PRIVATE_KEY not set');
    return false;
  }
  
  // Log credential info for debugging (without exposing sensitive data)
  console.log('Google Sheets credentials validation:');
  console.log('- Sheet ID:', process.env.GOOGLE_SHEET_ID ? 'Set' : 'Not set');
  console.log('- Client Email:', process.env.GOOGLE_CLIENT_EMAIL ? 'Set' : 'Not set');
  console.log('- Private Key:', process.env.GOOGLE_PRIVATE_KEY ? 'Set' : 'Not set');
  console.log('- Private Key Length:', process.env.GOOGLE_PRIVATE_KEY?.length || 0);
  
  return true;
}

// Authenticate with Google Sheets
export function getAuth() {
  try {
    const credentials = getCredentials();
    console.log('Creating Google Auth with credentials...');
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } catch (error) {
    console.error('Error creating Google Auth:', error);
    throw error;
  }
}

export interface Transaction {
  id: number;
  date: string;
  type: string;
  partner: string;
  description: string;
  amount: number;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdTimestamp: number;
  updatedTimestamp: number;
}

export interface LedgerData {
  transactions: Transaction[];
  nextId: number;
  lastUpdated: string;
  version: string;
}

// Convert sheet row to transaction object
function rowToTransaction(row: any[], index: number): Transaction {
  // Handle ID conversion more robustly
  let id: number;
  if (row[0] === undefined || row[0] === null || row[0] === '') {
    id = index + 1; // Fallback to index-based ID
  } else {
    const parsedId = parseInt(String(row[0]));
    id = isNaN(parsedId) ? index + 1 : parsedId;
  }
  
  console.log(`Row ${index}: ID from sheet: "${row[0]}" (type: ${typeof row[0]}), parsed: ${id}`);
  
  return {
    id,
    date: row[1] || '',
    type: row[2] || '',
    partner: row[3] || '',
    description: row[4] || '',
    amount: parseFloat(row[5]) || 0,
    deleted: row[6] === 'TRUE' || row[6] === true,
    createdAt: row[7] || new Date().toISOString(),
    updatedAt: row[8] || new Date().toISOString(),
    createdTimestamp: parseInt(row[9]) || Date.now(),
    updatedTimestamp: parseInt(row[10]) || Date.now(),
  };
}

// Convert transaction object to sheet row
function transactionToRow(transaction: Transaction): any[] {
  // Ensure ID is a number
  const id = Number(transaction.id);
  if (isNaN(id)) {
    console.error(`Invalid ID for transaction: ${transaction.id}`);
  }
  
  const row = [
    id, // Ensure ID is written as a number
    transaction.date,
    transaction.type,
    transaction.partner,
    transaction.description,
    transaction.amount,
    transaction.deleted,
    transaction.createdAt,
    transaction.updatedAt,
    transaction.createdTimestamp,
    transaction.updatedTimestamp,
  ];
  
  console.log(`Writing transaction to sheet: ID=${id} (type: ${typeof id}), Row=`, row);
  return row;
}

// Load data from Google Sheets
export async function loadDataFromSheets(): Promise<LedgerData> {
  try {
    // Check if Google Sheets is configured
    if (!validateCredentials()) {
      console.log('Google Sheets not configured, falling back to default data');
      return {
        transactions: [],
        nextId: 1,
        lastUpdated: new Date().toISOString(),
        version: '1.0'
      };
    }

    const auth = getAuth();
    const sheetsWithAuth = google.sheets({ version: 'v4', auth });

    // Read the data range (assuming headers are in row 1, data starts from row 2)
    const response = await sheetsWithAuth.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A2:K', // Adjust range as needed
    });

    const rows = response.data.values || [];
    console.log(`Loaded ${rows.length} rows from Google Sheets:`, rows);
    const transactions: Transaction[] = rows.map((row, index) => rowToTransaction(row, index));

    // Get metadata from a separate range or calculate
    const nextId = Math.max(...transactions.map(t => t.id), 0) + 1;
    const lastUpdated = new Date().toISOString();
    console.log(`Calculated nextId: ${nextId} from transaction IDs:`, transactions.map(t => t.id));

    return {
      transactions: transactions.filter(t => !t.deleted),
      nextId,
      lastUpdated,
      version: '1.0'
    };
  } catch (error) {
    console.error('Error loading data from Google Sheets:', error);
    // Return default structure if there's an error
    return {
      transactions: [],
      nextId: 1,
      lastUpdated: new Date().toISOString(),
      version: '1.0'
    };
  }
}

// Save data to Google Sheets
export async function saveDataToSheets(data: LedgerData): Promise<boolean> {
  try {
    // Check if Google Sheets is configured
    if (!validateCredentials()) {
      console.log('Google Sheets not configured, skipping save');
      return false;
    }

    const auth = getAuth();
    const sheetsWithAuth = google.sheets({ version: 'v4', auth });

    // Prepare data for writing
    const values = data.transactions.map(transaction => transactionToRow(transaction));
    console.log(`Saving ${values.length} transactions to Google Sheets:`, values);
    
    // Add headers
    const headers = [
      'ID', 'Date', 'Type', 'Partner', 'Description', 'Amount', 
      'Deleted', 'Created At', 'Updated At', 'Created Timestamp', 'Updated Timestamp'
    ];

    // Clear existing data and write new data
    await sheetsWithAuth.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:K',
    });

    // Write headers
    await sheetsWithAuth.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1:K1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });

    // Write data
    if (values.length > 0) {
      await sheetsWithAuth.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A2:K',
        valueInputOption: 'RAW',
        requestBody: {
          values,
        },
      });
    }

    return true;
  } catch (error) {
    console.error('Error saving data to Google Sheets:', error);
    return false;
  }
}

// Add a new transaction to Google Sheets
export async function addTransactionToSheets(transaction: Transaction): Promise<boolean> {
  try {
    // Check if Google Sheets is configured
    if (!validateCredentials()) {
      console.log('Google Sheets not configured, skipping add transaction');
      return false;
    }

    const auth = getAuth();
    const sheetsWithAuth = google.sheets({ version: 'v4', auth });

    const row = transactionToRow(transaction);
    
    await sheetsWithAuth.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:K',
      valueInputOption: 'RAW',
      requestBody: {
        values: [row],
      },
    });

    return true;
  } catch (error) {
    console.error('Error adding transaction to Google Sheets:', error);
    return false;
  }
}

// Update a transaction in Google Sheets
export async function updateTransactionInSheets(transaction: Transaction): Promise<boolean> {
  try {
    // Check if Google Sheets is configured
    if (!validateCredentials()) {
      console.log('Google Sheets not configured, skipping update transaction');
      return false;
    }

    const auth = getAuth();
    const sheetsWithAuth = google.sheets({ version: 'v4', auth });

    // Find the row number for this transaction
    const response = await sheetsWithAuth.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:A',
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row, index) => 
      index > 0 && parseInt(row[0]) === transaction.id
    );

    if (rowIndex === -1) {
      console.error('Transaction not found in sheet');
      return false;
    }

    const row = transactionToRow(transaction);
    const range = `Sheet1!A${rowIndex + 1}:K${rowIndex + 1}`;

    await sheetsWithAuth.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [row],
      },
    });

    return true;
  } catch (error) {
    console.error('Error updating transaction in Google Sheets:', error);
    return false;
  }
}

// Debug function to check what's actually in the Google Sheet
export async function debugGoogleSheet(): Promise<void> {
  try {
    if (!SPREADSHEET_ID || !process.env.GOOGLE_CLIENT_EMAIL) {
      console.log('Google Sheets not configured');
      return;
    }

    const auth = getAuth();
    const sheetsWithAuth = google.sheets({ version: 'v4', auth });

    // Read the entire sheet
    const response = await sheetsWithAuth.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:K',
    });

    console.log('=== GOOGLE SHEET DEBUG ===');
    console.log('Raw data from sheet:', response.data.values);
    console.log('Number of rows:', response.data.values?.length || 0);
    
    if (response.data.values && response.data.values.length > 0) {
      console.log('Headers:', response.data.values[0]);
      if (response.data.values.length > 1) {
        console.log('First data row:', response.data.values[1]);
        console.log('First row ID:', response.data.values[1][0], 'Type:', typeof response.data.values[1][0]);
      }
    }
    console.log('=== END DEBUG ===');
  } catch (error) {
    console.error('Error debugging Google Sheet:', error);
  }
}

