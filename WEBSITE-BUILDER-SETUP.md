# Website Builder - Deployment Setup Guide

## Overview

The Website Builder publishing system uses:
- **Cloudflare R2** - Storage for published HTML files
- **Cloudflare Workers** - Serves websites from R2
- **Cloudflare KV** - Temporary preview storage
- **Cloudflare Pages Functions** - Deployment API endpoint

## Step 1: Create R2 Bucket

1. Go to Cloudflare Dashboard → R2
2. Create bucket: `dh-websites`
3. Enable public access (or configure Worker to serve)
4. Note the bucket name for environment variables

## Step 2: Create KV Namespace

1. Go to Cloudflare Dashboard → Workers & Pages → KV
2. Create namespace: `website-previews`
3. Note the namespace ID

## Step 3: Deploy Website Host Worker

The Worker at `/workers/website-host/index.js` serves published websites.

### Using Wrangler CLI:

```bash
cd workers/website-host

# Create wrangler.toml
cat > wrangler.toml << 'EOF'
name = "dh-website-host"
main = "index.js"
compatibility_date = "2024-08-04"

[[r2_buckets]]
binding = "WEBSITE_BUCKET"
bucket_name = "dh-websites"

[[kv_namespaces]]
binding = "PREVIEW_KV"
id = "YOUR_KV_NAMESPACE_ID"

[vars]
SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"

[env.production.vars]
DOMAIN = "dhwebsiteservices.co.uk"

[env.staging.vars]
DOMAIN = "dh-staging.pages.dev"
EOF

# Deploy
npx wrangler deploy
```

### Configure Custom Domains:

1. In Cloudflare Dashboard → Workers & Pages → dh-website-host
2. Add custom domain: `sites.dhwebsiteservices.co.uk`
3. Add custom domain: `preview.dhwebsiteservices.co.uk`
4. DNS records will be created automatically

## Step 4: Configure Cloudflare Pages Environment Variables

Add these secrets to your Pages project:

```bash
# Go to: Cloudflare Dashboard → Pages → dh-portal-v2 → Settings → Environment Variables

WEBSITE_BUCKET = "dh-websites"  # R2 bucket binding
PREVIEW_KV = "website-previews"  # KV namespace binding
DOMAIN = "dhwebsiteservices.co.uk"  # Production domain
```

**Note:** R2 and KV bindings must be configured in Pages settings, not as plain env vars.

### To add R2 binding in Pages:

1. Pages Project → Settings → Functions
2. R2 bucket bindings → Add binding
3. Variable name: `WEBSITE_BUCKET`
4. R2 bucket: `dh-websites`

### To add KV binding in Pages:

1. Pages Project → Settings → Functions
2. KV namespace bindings → Add binding
3. Variable name: `PREVIEW_KV`
4. KV namespace: Select `website-previews`

## Step 5: Update Supabase Database Schema

Add deployment tracking fields to `website_pages` table:

```sql
-- Add deployed_url to settings JSONB (no schema change needed)
-- The settings field already exists and can store:
-- { deployed_url, last_deployed_at, deployment_error, etc. }

-- Optional: Add explicit columns if preferred
ALTER TABLE website_pages
ADD COLUMN deployed_url TEXT,
ADD COLUMN last_deployed_at TIMESTAMPTZ,
ADD COLUMN deployment_error TEXT;

-- Update existing pages to extract deployed_url from settings
UPDATE website_pages
SET deployed_url = settings->>'deployed_url'
WHERE settings->>'deployed_url' IS NOT NULL;
```

## Step 6: Test the System

### Test Preview:

1. Open Website Builder → Edit a page
2. Click "Preview" button
3. Should open new tab with temporary URL: `https://preview.dhwebsiteservices.co.uk/{uuid}`
4. Preview expires after 5 minutes

### Test Publish:

1. Edit a page and add some content
2. Click "Publish" button
3. Should show success message with URL
4. Open URL: `https://sites.dhwebsiteservices.co.uk/{page-slug}`
5. Page should load with full HTML, CSS, and SEO meta tags

### Verify SEO:

```bash
# Check meta tags are present
curl -s https://sites.dhwebsiteservices.co.uk/my-page | grep -o '<meta.*>' | head -10
```

## Step 7: DNS Configuration

Add these DNS records in Cloudflare:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | sites | dh-website-host.workers.dev | ✅ Proxied |
| CNAME | preview | dh-website-host.workers.dev | ✅ Proxied |

## Troubleshooting

### Preview returns 404:
- Check KV namespace is bound correctly in Worker
- Verify PREVIEW_KV binding name matches code
- Check KV key TTL (should be 300 seconds)

### Publish returns error:
- Check R2 bucket permissions
- Verify WEBSITE_BUCKET binding in Pages Functions
- Check Supabase SERVICE_ROLE_KEY is set

### Published site not accessible:
- Verify Worker is deployed
- Check custom domains are configured
- Check R2 bucket has public access OR Worker has R2 read permissions

### SEO meta tags missing:
- Check page has SEO fields filled in database
- Verify generateFullHtml() function includes meta tags
- View page source (not inspector) to see full HTML

## Cost Estimates

Based on 100 published pages, 1000 views/day:

- **R2 Storage:** 100 pages × 50KB = 5MB → $0.00/month (under free tier)
- **R2 Requests:** 1000 reads/day = 30K/month → $0.00/month (under free tier)
- **Workers:** 30K requests/month → $0.00/month (under free tier)
- **KV:** Preview storage (ephemeral) → $0.00/month (under free tier)
- **Pages Functions:** 1K builds/month → $0.00/month (under free tier)

**Total:** $0.00/month for typical usage

## Architecture Diagram

```
User Browser
    ↓
    ↓ (Edit in Website Builder)
    ↓
DH Portal (React App)
    ↓
    ↓ POST /api/website-deploy
    ↓
Cloudflare Pages Function
    ↓
    ├─→ Upload HTML to R2 Bucket (dh-websites/pages/slug.html)
    ├─→ Update Supabase (deployed_url, published_at)
    └─→ Return: { url: "https://sites.dhwebsiteservices.co.uk/slug" }
    
    
Public User Browser
    ↓
    ↓ GET https://sites.dhwebsiteservices.co.uk/my-page
    ↓
Cloudflare Worker (dh-website-host)
    ↓
    └─→ Fetch from R2: pages/my-page.html
        └─→ Serve HTML (with SEO meta tags)
```

## Security Checklist

- ✅ R2 bucket write-only from Pages Function (SERVICE_ROLE_KEY)
- ✅ R2 bucket read-only from Worker (public or Worker auth)
- ✅ KV previews auto-expire (5 min TTL)
- ✅ HTML sanitization before deployment (already done in useAssets.js)
- ✅ SEO meta tags escaped to prevent XSS
- ✅ No user-uploaded JavaScript execution (static HTML only)

## Next Steps

1. ✅ Create R2 bucket
2. ✅ Create KV namespace
3. ✅ Deploy Worker
4. ✅ Configure Pages bindings
5. ✅ Test preview
6. ✅ Test publish
7. ⚠️ Custom domain support (future)
8. ⚠️ Multi-page navigation (future)
9. ⚠️ Form handling (future)

---

**Last Updated:** 2026-08-04
**Status:** Ready for deployment (infrastructure setup required)
