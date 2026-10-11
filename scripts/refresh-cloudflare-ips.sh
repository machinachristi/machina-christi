#!/usr/bin/env bash
# Refresh infra/cloudflare-ips.json from Cloudflare's published list, then
# review the diff and open a PR; CI applies it on merge. Cloudflare changes
# these rarely (a few times a decade).
set -euo pipefail
cd "$(dirname "$0")/.."
curl -fsS https://api.cloudflare.com/client/v4/ips | python3 -c "
import json, sys
d = json.load(sys.stdin)['result']
out = {'_comment': 'Cloudflare proxy address ranges (https://www.cloudflare.com/ips/). Refresh with scripts/refresh-cloudflare-ips.sh, then redeploy.',
       'ipv4': sorted(d['ipv4_cidrs']), 'ipv6': sorted(d['ipv6_cidrs'])}
print(json.dumps(out, indent=2))" > infra/cloudflare-ips.json
git --no-pager diff --stat infra/cloudflare-ips.json
