
import { CardData } from '../types';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';

// List of filenames used in various previous versions
const POSSIBLE_FILE_NAMES = [
  'card_collection.json',
  'cards.json',
  'nga_cards.json',
  'nga_collection.json'
];

const PREFERRED_FILE_NAME = 'card_collection.json';

// Helper to find the *latest* file among all possible legacy names
const findFileId = async (accessToken: string): Promise<string | null> => {
  // Build a query that looks for any of our known filenames
  const nameQuery = POSSIBLE_FILE_NAMES.map(name => `name='${name}'`).join(' or ');
  const q = `(${nameQuery}) and trashed=false`;

  const url =
    `${DRIVE_API_URL}/files` +
    `?spaces=drive,appDataFolder` +
    `&fields=files(id,name,modifiedTime)` +
    `&q=${encodeURIComponent(q)}` +
    `&orderBy=modifiedTime desc` +
    `&pageSize=20`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('Drive API search error:', error);
    return null;
  }

  const data = await response.json();
  const files = Array.isArray(data?.files) ? data.files : [];
  
  if (files.length > 0) {
    console.log(`[DriveService] Found ${files.length} potential collection files. Selecting latest: ${files[0].name} (${files[0].id})`);
    return files[0].id;
  }
  
  return null;
};

export const getCollection = async (
  accessToken: string
): Promise<{ fileId: string | null; cards: CardData[] }> => {
  const fileId = await findFileId(accessToken);
  if (!fileId) {
    console.log("[DriveService] No existing collection files found in Google Drive.");
    return { fileId: null, cards: [] };
  }

  try {
    const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 404) return { fileId: null, cards: [] };
    
    if (!response.ok) {
      throw new Error('Failed to download collection file.');
    }

    const cards = await response.json();
    return { fileId, cards: Array.isArray(cards) ? cards : [] };
  } catch (e) {
    console.error('Error loading collection from Drive:', e);
    return { fileId, cards: [] };
  }
};

export const saveCollection = async (
  accessToken: string,
  fileId: string | null,
  cards: CardData[]
): Promise<string> => {
  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name: PREFERRED_FILE_NAME,
    mimeType: 'application/json',
  };

  if (!fileId) {
    metadata.parents = ['appDataFolder'];
  }

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(cards)], { type: 'application/json' }));

  const url = fileId
    ? `${UPLOAD_API_URL}/files/${fileId}?uploadType=multipart`
    : `${UPLOAD_API_URL}/files?uploadType=multipart`;

  const method = fileId ? 'PATCH' : 'POST';

  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error('Failed to save collection to Google Drive.');
  }

  const newFileData = await response.json();
  return newFileData.id;
};
