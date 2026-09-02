/**
 * SharePoint Graph connector for knowledge base document crawling.
 * Site/drive are read from cs_settings (kbSiteId, kbDriveId), not env.
 * Missing config surfaces as Settings frame 3.4 and GET /api/health/kb 200 {ok:false}.
 */

import { graphRequest, graphRequestText, GraphError } from './client';
import { log } from '../log';

export interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  file?: {
    mimeType: string;
    hashes?: {
      quickXorHash?: string;
      sha256Hash?: string;
    };
  };
  folder?: {
    childCount: number;
  };
  parentReference?: {
    path: string;
    driveId: string;
  };
  lastModifiedDateTime?: string;
  eTag?: string;
}

interface DriveItemsResponse {
  value: DriveItem[];
  '@odata.nextLink'?: string;
}

const SUPPORTED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

/**
 * List all files in a SharePoint drive folder recursively.
 * Returns only supported document types.
 */
export async function listDriveItems(
  siteId: string,
  driveId: string,
  folderPath: string = '/',
): Promise<DriveItem[]> {
  const items: DriveItem[] = [];
  const encodedPath = folderPath === '/' ? 'root' : `root:${encodeURIComponent(folderPath)}:`;

  let url = `/sites/${encodeURIComponent(siteId)}/drives/${encodeURIComponent(driveId)}/${encodedPath}/children?$select=id,name,webUrl,size,file,folder,parentReference,lastModifiedDateTime,eTag&$top=200`;

  while (url) {
    const isAbsolute = url.startsWith('http');
    const response = await graphRequest<DriveItemsResponse>(url, { absolute: isAbsolute });

    for (const item of response.value) {
      if (item.file && item.file.mimeType && SUPPORTED_MIME_TYPES.has(item.file.mimeType)) {
        items.push(item);
      } else if (item.folder) {
        const childPath = item.parentReference?.path
          ? `${item.parentReference.path.replace(/^\/drive\/root:?/, '')}/${item.name}`
          : `/${item.name}`;
        const children = await listDriveItems(siteId, driveId, childPath);
        items.push(...children);
      }
    }

    url = response['@odata.nextLink'] ?? '';
  }

  log.debug('listed sharepoint drive items', {
    siteId,
    driveId,
    folderPath,
    count: items.length,
  });

  return items;
}

/**
 * Get text content of a document via Graph's content endpoint.
 * Uses the text preview endpoint for supported formats.
 */
export async function getDocumentContent(
  siteId: string,
  driveId: string,
  itemId: string,
): Promise<string> {
  try {
    const content = await graphRequestText(
      `/sites/${encodeURIComponent(siteId)}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`,
    );
    return content;
  } catch (e) {
    if (e instanceof GraphError && e.status === 406) {
      log.debug('document content not available as text, skipping', { itemId });
      return '';
    }
    throw e;
  }
}

/**
 * Get a single drive item by ID.
 */
export async function getDriveItem(
  siteId: string,
  driveId: string,
  itemId: string,
): Promise<DriveItem> {
  return graphRequest<DriveItem>(
    `/sites/${encodeURIComponent(siteId)}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,webUrl,size,file,folder,parentReference,lastModifiedDateTime,eTag`,
  );
}

/**
 * Test SharePoint connection by listing the root folder.
 * Returns true if the connection works, false if it fails.
 */
export async function testSharePointConnection(
  siteId: string,
  driveId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await graphRequest<DriveItemsResponse>(
      `/sites/${encodeURIComponent(siteId)}/drives/${encodeURIComponent(driveId)}/root/children?$top=1`,
    );
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.warn('sharepoint connection test failed', { siteId, driveId, error: message });
    return { ok: false, error: message };
  }
}
