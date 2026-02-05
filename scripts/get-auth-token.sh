#!/usr/bin/env bash
# Load .env.local and get Supabase access token. Usage: ./scripts/get-auth-token.sh <email> <password>
# Run from repo root. Requires: curl, jq (optional, for pretty output).

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local in $ROOT" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source .env.local
set +a

for key in SUPABASE_URL SUPABASE_PUBLISHABLE_KEY; do
  if [[ -z "${!key}" ]]; then
    echo "Missing $key in .env.local" >&2
    exit 1
  fi
done

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <email> <password>" >&2
  exit 1
fi
email="$1"
password="$2"

body=$(jq -n --arg e "$email" --arg p "$password" '{email:$e,password:$p}')
resp=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_PUBLISHABLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$body")

if command -v jq &>/dev/null; then
  echo "$resp" | jq -r '.access_token // empty'
  if [[ -z $(echo "$resp" | jq -r '.access_token // empty') ]]; then
    echo "$resp" | jq '.' >&2
    exit 1
  fi
else
  echo "$resp"
fi
