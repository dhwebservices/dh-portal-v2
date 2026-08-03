# Supabase Storage Setup for Website Builder

## Required: Create Storage Bucket

The website builder needs a Supabase Storage bucket for assets (images, videos, documents).

### Steps:

1. **Go to Supabase Dashboard**
   - Navigate to your project: https://supabase.com/dashboard

2. **Create Storage Bucket**
   - Click "Storage" in the left sidebar
   - Click "Create a new bucket"
   - **Bucket name:** `website-assets`
   - **Public bucket:** ✅ Yes (check this box)
   - Click "Create bucket"

3. **Set Bucket Policies (Optional but Recommended)**
   
   Go to the bucket's policies tab and add:

   **Policy for SELECT (read):**
   ```sql
   -- Allow anyone to read assets
   CREATE POLICY "Public Access"
   ON storage.objects FOR SELECT
   USING (bucket_id = 'website-assets');
   ```

   **Policy for INSERT (upload):**
   ```sql
   -- Allow authenticated users to upload
   CREATE POLICY "Authenticated users can upload"
   ON storage.objects FOR INSERT
   TO authenticated
   WITH CHECK (bucket_id = 'website-assets');
   ```

   **Policy for DELETE:**
   ```sql
   -- Allow authenticated users to delete their uploads
   CREATE POLICY "Authenticated users can delete"
   ON storage.objects FOR DELETE
   TO authenticated
   USING (bucket_id = 'website-assets');
   ```

## Alternative: Use Cloudflare R2

If you prefer to use Cloudflare R2 instead of Supabase Storage:

1. Create R2 bucket in Cloudflare dashboard
2. Get Access Key ID and Secret Access Key
3. Update `useAssets.js` to upload to R2 instead of Supabase Storage
4. Add R2 credentials to environment variables

## Verify Setup

After creating the bucket, test by:

1. Go to `/website-builder` in staff portal
2. Create or edit a page
3. Click "Upload Assets" button
4. Upload an image
5. Image should appear in asset grid

## Troubleshooting

**Error: "Bucket not found"**
- Make sure bucket name is exactly `website-assets`
- Check bucket exists in Supabase Storage dashboard

**Error: "Access denied"**
- Make sure bucket is set to Public
- Check RLS policies are configured correctly
- Verify user is authenticated

**Upload succeeds but no image shown**
- Check database table `website_assets` has the record
- Verify `storage_url` is publicly accessible
- Check browser console for CORS errors
