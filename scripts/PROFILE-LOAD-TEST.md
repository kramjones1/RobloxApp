# Read-only profile API load test

This script measures the production profile read path using k6. It does not create posts, upload files, change profile fields, or write to the database.

## What it measures

- Authenticated read of the profile row
- Read of up to 50 profile posts (including image paths)
- Download of the first image found in those posts
- Per-request latency, HTTP failures, and overall request rate

The test account is used as the viewer and, by default, its own profile is tested. Set TARGET_USER_ID only if you intentionally want to read another profile and the account is allowed to view it.

## Safety

- Run locally only. Never put passwords, access tokens, or .env files in GitHub or chat.
- Use a dedicated test account, not your personal account.
- The script ramps only to 25 virtual users by default. Do not raise this until the first run is reviewed.
- Stop the test if you see HTTP 429 responses, elevated errors, or unexpected production impact.
- This is an API load test, not 25 full browser sessions or 25 separate authenticated accounts. It does not test WebRTC, Realtime presence, or the full visual browser experience.

## Run

Install k6 from https://grafana.com/docs/k6/latest/set-up/install-k6/.

Set these environment variables in your local terminal:
- SUPABASE_ANON_KEY: the public anon key already used by the app in supabaseClient.ts
- Either SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD, or a current SUPABASE_ACCESS_TOKEN

The password/token is read only from your local environment. Do not commit it.

### macOS / Linux

```sh
export SUPABASE_ANON_KEY='YOUR_PUBLIC_ANON_KEY'
export SUPABASE_TEST_EMAIL='test123@gmail.com'
read -s SUPABASE_TEST_PASSWORD
export SUPABASE_TEST_PASSWORD
k6 run scripts/profile-load-test.js
unset SUPABASE_TEST_PASSWORD
```

### PowerShell

```powershell
$env:SUPABASE_ANON_KEY = 'YOUR_PUBLIC_ANON_KEY'
$env:SUPABASE_TEST_EMAIL = 'test123@gmail.com'
$secure = Read-Host 'Test account password' -AsSecureString
$env:SUPABASE_TEST_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
k6 run scripts/profile-load-test.js
Remove-Item Env:SUPABASE_TEST_PASSWORD
```

Use the k6 summary to review p95 latency, request failure rate, and throughput. Save the terminal output locally if you want to share the results; make sure it contains no credentials or tokens.
