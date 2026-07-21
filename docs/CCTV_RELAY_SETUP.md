# CCTV Relay Setup

This setup turns a **local office Tapo camera** into a **public browser-safe CCTV URL** that you can paste into the HOA system.

It is built for this situation:

- HOA app deployed publicly on **Render**
- CCTV relay deployed on **Hostinger VPS**
- Tapo C500 camera stays on the **office LAN**

The relay flow is:

```text
Tapo C500 (office LAN)
-> office PC pulls local RTSP
-> office PC publishes to Hostinger VPS MediaMTX
-> MediaMTX exposes HTTPS WebRTC / HLS
-> HOA CCTV module uses the public browser URL
```

## What this avoids

- no Agent DVR remote subscription
- no direct public exposure of the Tapo camera
- no raw `rtsp://` in the deployed browser UI

## Files added for this setup

- `infra/cctv-relay/docker-compose.yml`
- `infra/cctv-relay/Caddyfile`
- `infra/cctv-relay/mediamtx.yml`
- `infra/cctv-relay/.env.example`
- `infra/cctv-relay/publish-office-camera.ps1`

## 1. DNS you need first

Create these DNS records and point them to the **Hostinger VPS public IP**:

- `cctv.example.com`
- `hls.cctv.example.com`

Replace `example.com` with your real domain.

`cctv.example.com` will serve the WebRTC viewer.
`hls.cctv.example.com` will serve the HLS viewer.

## 2. Hostinger VPS setup

Use a **Hostinger VPS**, not ordinary shared hosting.

Hostinger documents that shared/web hosting has fixed open ports, while VPS gives you port and firewall control:

- https://support.hostinger.com/en/articles/1583736-what-ports-are-open-at-hostinger
- https://www.hostinger.com/support/4805502-how-to-set-up-a-firewall-at-vps/
- https://www.hostinger.com/support/8306612-how-to-use-the-docker-vps-template-at-hostinger/

### Recommended VPS base

- Ubuntu VPS with Docker template

### Open firewall ports on the VPS

Allow:

- `80/tcp`
- `443/tcp`
- `8554/tcp`

`8554` is used only for the office PC to publish into the relay.

## 3. Upload the relay files to the VPS

Copy the `infra/cctv-relay/` folder to the VPS, for example:

```text
/opt/ecotrend-cctv-relay
```

### Prepare `.env`

Copy `.env.example` to `.env` and set:

```env
PRIMARY_WEBRTC_DOMAIN=cctv.example.com
PRIMARY_HLS_DOMAIN=hls.cctv.example.com
PUBLISH_USER=officepublisher
PUBLISH_PASS=change-this-long-random-password
STREAM_PATH=office-cctv
```

Use a strong `PUBLISH_PASS`.

## 4. Start the relay on the VPS

From the relay folder:

```bash
docker compose up -d
```

This starts:

- `mediamtx`
- `caddy`

### Public URLs after startup

If DNS is already correct and TLS is issued successfully:

- WebRTC viewer:
  - `https://cctv.example.com/office-cctv`
- HLS viewer:
  - `https://hls.cctv.example.com/office-cctv`

These are the URLs you will use in the HOA system.

## 5. Office PC publisher setup

The camera stays local in the office at `192.168.1.2`.

The VPS **must not** try to pull `192.168.1.2` directly, because that address is private and not reachable from the internet.

Instead, the office PC pulls the local camera feed and **publishes** it to the VPS.

### Prerequisite

Install FFmpeg on the office PC and make sure `ffmpeg.exe` is available.

### PowerShell publisher script

Use `infra/cctv-relay/publish-office-camera.ps1`.

Before running it, set environment variables in PowerShell:

```powershell
$env:SOURCE_RTSP_URL = 'rtsp://EcotrendCCTV:YOUR_CAMERA_PASSWORD@192.168.1.2:554/stream1'
$env:RELAY_HOST = 'cctv.example.com'
$env:RELAY_STREAM_PATH = 'office-cctv'
$env:RELAY_PUBLISH_USER = 'officepublisher'
$env:RELAY_PUBLISH_PASS = 'change-this-long-random-password'
```

Then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\publish-office-camera.ps1
```

The script loops forever and republishes if the office network or camera drops temporarily.

## 6. Verify the public relay

After the office PC publisher is running:

Open these in a browser:

- `https://cctv.example.com/office-cctv`
- `https://hls.cctv.example.com/office-cctv`

If WebRTC has trouble, HLS is the fallback.

## 7. What to put in the HOA CCTV module

Edit the CCTV feed in the HOA system and set:

- `Provider`: `MediaMTX`
- `Source Type`: `RTSP + Browser Gateway`
- `Camera IP / Hostname`: `192.168.1.2`
- `RTSP Port`: `554`
- `ONVIF Port`: `2020`
- `Stream Path`: `/stream1`
- `Camera Username`: `EcotrendCCTV`
- `Browser Preview URL`: `https://cctv.example.com/office-cctv`
- `Monitor Link`: `https://cctv.example.com/office-cctv`

If HLS behaves better in your target browser, use:

- `Browser Preview URL`: `https://hls.cctv.example.com/office-cctv`

## 8. What to deploy now vs later

### Deploy now

- the HOA app on Render
- the relay on Hostinger VPS
- the publisher on the office PC

### Keep in mind

- if the office PC is off, the stream stops
- if the office network is down, the stream stops
- this is a relay, not a cloud recording platform

## 9. Security notes

This setup protects the **camera itself** from direct public access, which is better than exposing Tapo RTSP straight to the internet.

Still, it is intentionally a fast operational setup:

- publish side is authenticated
- read side is public to anyone who has the viewer URL

If you want tighter access later, add one of these:

- reverse proxy auth
- VPN-only access
- signed short-lived viewer URLs
- backend-authenticated iframe proxy

## 10. Relevant docs

MediaMTX:

- intro: https://mediamtx.org/docs/kickoff/introduction
- browser viewing: https://mediamtx.org/docs/read/web-browsers
- config reference: https://mediamtx.org/docs/references/configuration-file
- FFmpeg publish: https://mediamtx.org/docs/publish/ffmpeg
- RTSP publish/read: https://mediamtx.org/docs/publish/rtsp-clients

TP-Link Tapo:

- C500 specs: https://www.tp-link.com/us/home-networking/cloud-camera/tapo-c500/
- RTSP / ONVIF FAQ: https://www.tp-link.com/us/support/faq/4465/

Hostinger:

- Docker VPS template: https://www.hostinger.com/support/8306612-how-to-use-the-docker-vps-template-at-hostinger/
- VPS firewall: https://www.hostinger.com/support/4805502-how-to-set-up-a-firewall-at-vps/

## 11. Minimal rollout checklist

1. Buy / prepare Hostinger VPS
2. Point `cctv.example.com` and `hls.cctv.example.com` to the VPS
3. Upload relay files
4. Fill `.env`
5. `docker compose up -d`
6. Start office PC publisher script
7. Confirm `https://cctv.example.com/office-cctv` loads
8. Paste that URL into `Browser Preview URL`
