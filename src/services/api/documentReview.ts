import axios from 'axios';
import { SUPABASE_CONFIG } from '../../config/supabaseConfig';
import { DocumentType, VehicleType } from './driverVerification';

const API_URL = SUPABASE_CONFIG.url;
const ANON_KEY = SUPABASE_CONFIG.anonKey;
const BUCKET = 'driver-documents';

// Long enough to look a document over and zoom in; short enough that a
// URL copied out of the app stops working soon after.
const SIGNED_URL_SECONDS = 300;

export interface ReviewQueueItem {
  id: string;
  submitted_at: string;
  driver_name: string | null;
  driver_email: string | null;
  doc_type: DocumentType;
  storage_path: string;
  vehicle_type: VehicleType | null;
  has_trailer: boolean | null;
  trailer_capacity_lbs: number | null;
  driver_auth_id: string;
}

export type ReviewOutcome =
  | { kind: 'reviewed' }
  // The driver replaced the file, or another admin decided first.
  | { kind: 'changed' }
  | { kind: 'failed'; message: string };

const authHeaders = (accessToken: string) => ({
  'Content-Type': 'application/json',
  apikey: ANON_KEY,
  Authorization: `Bearer ${accessToken}`,
});

/** Pending documents, oldest first. Null if the caller isn't an admin or the request failed. */
export async function getReviewQueue(accessToken: string): Promise<ReviewQueueItem[] | null> {
  try {
    const response = await axios.post(
      `${API_URL}/rest/v1/rpc/get_document_review_queue`,
      {},
      { headers: authHeaders(accessToken) }
    );
    return (response.data ?? []) as ReviewQueueItem[];
  } catch (error: any) {
    console.error('getReviewQueue error', { status: error?.response?.status, data: error?.response?.data });
    return null;
  }
}

/**
 * A short-lived URL for one document's file. The bucket is private, so
 * this is the only way to display it, and storage only signs it for an
 * admin or the driver who owns the file.
 */
export async function getDocumentImageUrl(
  accessToken: string,
  storagePath: string
): Promise<string | null> {
  try {
    const response = await axios.post(
      `${API_URL}/storage/v1/object/sign/${BUCKET}/${storagePath}`,
      { expiresIn: SIGNED_URL_SECONDS },
      { headers: authHeaders(accessToken) }
    );
    const signed: string | undefined = response.data?.signedURL;
    return signed ? `${API_URL}/storage/v1${signed}` : null;
  } catch (error: any) {
    console.error('getDocumentImageUrl error', { status: error?.response?.status, data: error?.response?.data });
    return null;
  }
}

/**
 * Approve or reject a document. Passes back the storage path the reviewer
 * looked at, so a replacement uploaded in the meantime isn't approved
 * unseen - that case, and another admin deciding first, come back as
 * 'changed'.
 */
export async function reviewDocument(
  accessToken: string,
  item: Pick<ReviewQueueItem, 'id' | 'storage_path'>,
  decision: { kind: 'approved'; expiresOn: string } | { kind: 'rejected'; reason: string }
): Promise<ReviewOutcome> {
  try {
    const response = await axios.post(
      `${API_URL}/rest/v1/rpc/review_driver_document`,
      {
        p_document_id: item.id,
        p_storage_path: item.storage_path,
        p_decision: decision.kind,
        p_expires_on: decision.kind === 'approved' ? decision.expiresOn : null,
        p_reason: decision.kind === 'rejected' ? decision.reason : null,
      },
      { headers: authHeaders(accessToken) }
    );
    const rows = Array.isArray(response.data) ? response.data : [response.data];
    return rows.length > 0 && rows[0] ? { kind: 'reviewed' } : { kind: 'changed' };
  } catch (error: any) {
    console.error('reviewDocument error', { status: error?.response?.status, data: error?.response?.data });
    return {
      kind: 'failed',
      message: error?.response?.data?.message ?? 'Check your connection and try again.',
    };
  }
}
