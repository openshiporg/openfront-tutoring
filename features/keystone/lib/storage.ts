/**
 * File storage (§8): S3-compatible when S3_BUCKET_NAME is set, otherwise local
 * disk under public/uploads so uploads work with no setup. Railway buckets reject
 * path-style requests (Barbershop s3-storage.ts), so storageapi.dev is virtual-hosted.
 */
export function s3ForcePathStyle(endpoint?: string): boolean {
  let hostname = ''
  try {
    hostname = endpoint ? new URL(endpoint).hostname : ''
  } catch {}
  return !(hostname === 'storageapi.dev' || hostname.endsWith('.storageapi.dev'))
}

function store(type: 'image' | 'file', folder: string) {
  const { S3_BUCKET_NAME, S3_REGION = 'auto', S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT } = process.env
  if (S3_BUCKET_NAME && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY) {
    return {
      kind: 's3' as const,
      type,
      bucketName: S3_BUCKET_NAME,
      region: S3_REGION,
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
      endpoint: S3_ENDPOINT,
      pathPrefix: `${folder}/`,
      signed: { expiry: 3600 },
      forcePathStyle: s3ForcePathStyle(S3_ENDPOINT),
    }
  }
  // Images (photos, logos) are public. Files (CVs, credentials, report attachments) are
  // kept outside public/ and served by /api/files, which checks the signed-in staff user.
  return type === 'image'
    ? { kind: 'local' as const, type, storagePath: 'public/uploads/images', serverRoute: null, generateUrl: (path: string) => `/uploads/images${path}` }
    : { kind: 'local' as const, type, storagePath: 'uploads/files', serverRoute: null, generateUrl: (path: string) => `/api/files${path}` }
}

export function storageConfig() {
  return {
    my_images: store('image', 'images'),
    my_files: store('file', 'files'),
  }
}
