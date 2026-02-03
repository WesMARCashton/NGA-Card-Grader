
import { CardData } from '../types';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME = 'card_collection.json';

// Helper to find the *latest* file in either appDataFolder or root Drive
const findFileId = async (accessToken: string): Promise<string | null> => {
  const q = `name='${FILE_NAME}' and trashed=false`;

  // We search in both 'drive' (user root) and 'appDataFolder' to recover legacy files
  const url =
    `${DRIVE_API_URL}/files` +
    `?spaces=drive,appDataFolder` +
    `&fields=files(id,name,modifiedTime)` +
    `&q=${encodeURIComponent(q)}` +
    `&orderBy=modifiedTime desc` +
    `&pageSize=10`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('Drive API findFileId error:', error);
    const message = (error as any)?.error?.message || 'Failed to search for collection file.';
    throw new Error(message);
  }

  const data = await response.json();
  const files = Array.isArray(data?.files) ? data.files : [];
  console.log(`[DriveService] Found ${files.length} potential collection files.`);
  
  // Return the most recently modified one
  return files.length > 0 ? files[0].id : null;
};

export const getCollection = async (
  accessToken: string
): Promise<{ fileId: string | null; cards: CardData[] }> => {
  const fileId = await findFileId(accessToken);
  if (!fileId) {
    console.log("[DriveService] No existing collection file found in Google Drive.");
    return { fileId: null, cards: [] };
  }

  console.log(`[DriveService] Attempting to load collection from file: ${fileId}`);
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404) {
    return { fileId: null, cards: [] };
  }
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Drive API getCollection error:', errorText);
    throw new Error('Failed to download collection file.');
  }

  try {
    const cards = await response.json();
    console.log(`[DriveService] Successfully loaded ${Array.isArray(cards) ? cards.length : 0} cards.`);
    return { fileId, cards: Array.isArray(cards) ? cards : [] };
  } catch (e) {
    console.error('Error parsing collection JSON:', e);
    return { fileId, cards: [] };
  }
};

export const saveCollection = async (
  accessToken: string,
  fileId: string | null,
  cards: CardData[]
): Promise<string> => {
  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name: FILE_NAME,
    mimeType: 'application/json',
  };

  // If new, we default to appDataFolder for privacy/cleanliness
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
    const error = await response.json().catch(() => ({}));
    console.error('Drive API save error:', error);
    throw new Error('Failed to save collection to Google Drive.');
  }

  const newFileData = await response.json();
  return newFileData.id;
};
