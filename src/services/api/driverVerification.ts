import axios from 'axios';
import { SUPABASE_CONFIG } from '../../config/supabaseConfig';

const API_URL = SUPABASE_CONFIG.url;
const ANON_KEY = SUPABASE_CONFIG.anonKey;
const BUCKET = 'driver-documents';

export type VehicleType = 'pickup' | 'flatbed' | 'box_truck' | 'dump_truck';
export type DocumentType = 'license' | 'registration' | 'insurance';
export type DocumentStatus = 'pending' | 'approved' | 'rejected';

// Shared by the driver's own screen and the admin review screens, so the
// two never call the same document by different names.
export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  pickup: 'Pickup truck',
  flatbed: 'Flatbed',
  box_truck: 'Box truck',
  dump_truck: 'Dump truck',
};

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  license: "Driver's license",
  registration: 'Vehicle registration',
  insurance: 'Proof of insurance',
};

export interface Vehicle {
  vehicle_type: VehicleType | null;
  has_trailer: boolean;
  trailer_capacity_lbs: number | null;
}

export interface DriverDocument {
  id: string;
  driver_auth_id: string;
  doc_type: DocumentType;
  storage_path: string;
  status: DocumentStatus;
  rejection_reason: string | null;
  expires_on: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

const authHeaders = (accessToken: string) => ({
  'Content-Type': 'application/json',
  apikey: ANON_KEY,
  Authorization: `Bearer ${accessToken}`,
});

export async function getVehicle(accessToken: string, authId: string): Promise<Vehicle | null> {
  try {
    const response = await axios.get(
      `${API_URL}/rest/v1/users?select=vehicle_type,has_trailer,trailer_capacity_lbs&auth_id=eq.${authId}`,
      { headers: authHeaders(accessToken) }
    );
    return (response.data?.[0] as Vehicle) ?? null;
  } catch (error: any) {
    console.error('getVehicle error', { status: error?.response?.status, data: error?.response?.data });
    return null;
  }
}

/**
 * A plain PATCH: the users UPDATE policy scopes it to the caller's own
 * row, and the column grants in 20261019000000 limit it to fields a user
 * may set about themselves.
 */
export async function saveVehicle(
  accessToken: string,
  authId: string,
  vehicle: Vehicle
): Promise<boolean> {
  try {
    await axios.patch(
      `${API_URL}/rest/v1/users?auth_id=eq.${authId}`,
      {
        ...vehicle,
        trailer_capacity_lbs: vehicle.has_trailer ? vehicle.trailer_capacity_lbs : null,
      },
      { headers: authHeaders(accessToken) }
    );
    return true;
  } catch (error: any) {
    console.error('saveVehicle error', { status: error?.response?.status, data: error?.response?.data });
    return false;
  }
}

export async function getDriverDocuments(accessToken: string): Promise<DriverDocument[]> {
  try {
    const response = await axios.get(`${API_URL}/rest/v1/driver_documents?select=*`, {
      headers: authHeaders(accessToken),
    });
    return (response.data ?? []) as DriverDocument[];
  } catch (error: any) {
    console.error('getDriverDocuments error', { status: error?.response?.status });
    return [];
  }
}

/**
 * The server's answer to "can I accept jobs?" - the same check the accept
 * RPC applies, so the app never shows a driver as ready when accepting
 * would be refused. False on failure: showing the setup prompt by mistake
 * costs a tap, hiding it by mistake costs a confusing refusal.
 */
export async function isVerifiedDriver(accessToken: string): Promise<boolean> {
  try {
    const response = await axios.post(
      `${API_URL}/rest/v1/rpc/is_verified_driver`,
      {},
      { headers: authHeaders(accessToken) }
    );
    return response.data === true;
  } catch (error: any) {
    console.error('isVerifiedDriver error', { status: error?.response?.status });
    return false;
  }
}

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
};

/**
 * Upload a photo of a document and submit it for review.
 *
 * Two steps: the file goes to Storage under the driver's own folder, then
 * `submit_driver_document` records it as their current document of that
 * type and puts it back into review. Each upload gets a fresh path, since
 * the storage policy allows no overwrites - see the migration for why.
 *
 * Uses fetch rather than axios for the upload: React Native's FormData
 * file parts ({ uri, name, type }) are reliable with fetch and not with
 * axios 1.x.
 */
export async function uploadDriverDocument(
  accessToken: string,
  authId: string,
  docType: DocumentType,
  fileUri: string
): Promise<DriverDocument | null> {
  const extension = (fileUri.split('.').pop() || 'jpg').toLowerCase();
  const mimeType = MIME_TYPES[extension] ?? 'image/jpeg';
  const path = `${authId}/${docType}-${Date.now()}.${extension}`;

  try {
    const form = new FormData();
    form.append('file', { uri: fileUri, name: path.split('/').pop(), type: mimeType } as any);

    const upload = await fetch(`${API_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!upload.ok) {
      console.error('uploadDriverDocument storage error', upload.status, await upload.text());
      return null;
    }

    const response = await axios.post(
      `${API_URL}/rest/v1/rpc/submit_driver_document`,
      { p_doc_type: docType, p_storage_path: path },
      { headers: authHeaders(accessToken) }
    );
    const submitted = Array.isArray(response.data) ? response.data[0] : response.data;
    return (submitted as DriverDocument) || null;
  } catch (error: any) {
    console.error('uploadDriverDocument error', {
      status: error?.response?.status,
      data: error?.response?.data,
      message: error?.message,
    });
    return null;
  }
}
