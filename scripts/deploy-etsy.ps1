# Run once after: npx firebase login
# Requires Blaze plan on project tracking-hub-webapp-29401
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

npx firebase use tracking-hub-webapp-29401

# Secrets (from local gitignored file created by setup — or paste when prompted)
if (Test-Path "$root\functions\.secret.local") {
  Get-Content "$root\functions\.secret.local" | ForEach-Object {
    if ($_ -match '^\s*ETSY_KEYSTRING=(.+)$') {
      $Matches[1].Trim() | npx firebase functions:secrets:set ETSY_KEYSTRING --data-file -
    }
    if ($_ -match '^\s*ETSY_SHARED_SECRET=(.+)$') {
      $Matches[1].Trim() | npx firebase functions:secrets:set ETSY_SHARED_SECRET --data-file -
    }
  }
} else {
  Write-Host "Create functions/.secret.local with ETSY_KEYSTRING=... and ETSY_SHARED_SECRET=..."
  exit 1
}

npx firebase deploy --only functions,firestore:rules
Write-Host "Done. Callback URL must be:"
Write-Host "https://us-central1-tracking-hub-webapp-29401.cloudfunctions.net/etsyOAuthCallback"
