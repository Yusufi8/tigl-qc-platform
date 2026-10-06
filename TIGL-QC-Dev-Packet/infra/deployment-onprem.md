# Deploying TIGL Quality on our own server (qc.tiglobal.com)
We are our own hosting vendor. No cloud, no external DNS vendor, no external identity provider.

## Server
- 1 Linux VM or box (Ubuntu 24.04 LTS): 8 vCPU, 16 GB RAM, 500 GB SSD (RAID1) to start; separate encrypted data volumes for Postgres and MinIO; UPS.
- Second host/NAS for nightly backups; offline monthly copy kept off-site.
- Environments: `prod`, `uat` (can share the box in separate Compose projects, ports/hostnames differ), `sandbox` for the Developer role on **synthetic data only**, ideally a different machine.

## DNS and TLS
1. Internal DNS (router/AD-less DNS/Pi-hole/Bind): `qc.tiglobal.com`, `qc-uat.tiglobal.com`, `qc-sbx.tiglobal.com` → server LAN IP. Remote sites: via company VPN.
2. Certificate: (a) TIGL internal CA cert for those names, installed on company PCs (also the same CA signs entity document-sealing certs), or (b) Let's Encrypt via DNS-01 if the public zone supports API updates. Drop files in `/etc/tigl-qc/tls/`.
3. Do not forward port 443 from the internet.

## First install
```
sudo mkdir -p /etc/tigl-qc/{tls,secrets} && cp .env.example /etc/tigl-qc/.env   # fill in
openssl rand -base64 32 > /etc/tigl-qc/secrets/db_password   # etc.; SIGNING_MASTER_KEY: generate, then BACK UP OFFLINE
docker compose -f docker-compose.prod.yml --env-file /etc/tigl-qc/.env up -d
docker compose logs api | grep "bootstrap admin"    # one-time temporary password for BOOTSTRAP_ADMIN_USERNAME
```
Sign in as the bootstrap admin → change password → create real users (username + role + temporary password) → Entities → generate/upload signing certificate for **T&I Global Limited** and **T&I Projects Private Limited** → Customers → set issuing entity per customer.

## Releases / rollback
Tag → CI builds images → private registry → `RELEASE=vX.Y.Z docker compose pull && up -d`. Rollback = previous `RELEASE`. DB migrations are forward/backward compatible for one release.

## Backups (see doc 07)
pgBackRest/WAL-G to second host; MinIO `mc mirror` nightly; **signing master key + certificate backups encrypted and stored separately by the Director of IT**. Quarterly restore drill on UAT.

## Odoo / SMTP
Odoo: reachable from the app host (LAN/VPN); API key of a dedicated integration user. SMTP: company mail server, dedicated `qc-notify@` mailbox.
