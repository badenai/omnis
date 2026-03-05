# Network Segmentation Guide: UDM Pro + Proxmox

---

## Current State

```
LWLcom (fiber)
    │
  UDM Pro (192.168.1.1)
    │  SFP+1 10GbE
    │
  USW Flex XG (192.168.1.2)
    ├── Port 2  2.5GbE  →  Proxmox host     192.168.1.210   WIN-NABR8IC4TU6
    │                      Windows VM        192.168.1.189   DESKTOP-F33E9RU (Proxmox VM)
    ├── Port 3  GbE     →  AX1200 AP (OG)    192.168.1.46    1200-AX-OG-BUERO
    │                        ├── (WiFi) MacBook Air    192.168.1.100
    │                        ├── (WiFi) A55-von-Laura  (smartphone, dynamic)
    │                        └── (wire) d4:d8:53:…:1f  192.168.1.252  unknown wired device
    └── Port 4  10GbE   →  NAS               192.168.1.237   0001_badenai

UDM Pro Port 2  →  AVM device  192.168.1.222   b0:f2:08:ff:b1:d6
                   Amazon      192.168.1.71    amazon-ccf084810

Everything is flat: 192.168.1.0/24
```

---

## Proposed Architecture

Add two VLANs. The Proxmox port becomes a trunk carrying all three VLANs.
Everything else stays physically where it is.

```
LWLcom (fiber)
    │
  UDM Pro (192.168.1.1)  ← single source of truth for all security policy
    │
  USW Flex XG (192.168.1.2)
    │
    ├── VLAN 1   192.168.1.0/24    Trusted LAN  (workstations, NAS, APs, IoT)
    ├── VLAN 10  192.168.10.0/24   Private Servers  (Windows VM, internal containers)
    └── VLAN 20  192.168.20.0/24   DMZ  (Omnis CT, reverse proxy)
```

**Rule:** UDM Pro owns all security policy. Proxmox only assigns VLAN tags to containers/VMs.
Never manage security in the Proxmox firewall.

---

## IP Address Allocation

### VLAN 1 — 192.168.1.0/24

| Range | Purpose |
|-------|---------|
| `.1–.9` | Network infrastructure |
| `.10–.19` | Access points |
| `.20–.29` | IoT / smart plugs |
| `.100–.119` | Wired workstations |
| `.130–.139` | Media / streaming |
| `.200–.219` | Servers / NAS |

#### Fixed IP reservations

| IP | Hostname | MAC (last 4) | Device |
|----|----------|--------------|--------|
| 192.168.1.1  | UDM Pro       | —     | Gateway (auto) |
| 192.168.1.2  | USW-Flex-XG   | —     | Switch (static) |
| 192.168.1.5  | AVM           | b1:d6 | AVM device (Fritz!Box or similar) |
| 192.168.1.10 | AP-EG-Flur    | df:0c | 1200-AX-EG-FLUR (ground floor AP) |
| 192.168.1.11 | AP-OG-Buero   | ee:87 | 1200-AX-OG-BUERO (upper floor office AP) |
| 192.168.1.13 | fritz-AP      | c3:99 | Fritz!Box (AP mode) |

| 192.168.1.20 | meross-1      | 64:32 | Meross smart plug (meross-mss110-6432) |
| 192.168.1.21 | meross-2      | 73:21 | Meross smart plug (meross-mss110-7321) |
| 192.168.1.22 | meross-3      | 74:6f | Meross smart plug (meross-mss110-746f) |
| 192.168.1.23 | meross-4      | 77:b1 | Meross smart plug (meross-mss110-77b1) |
| 192.168.1.100 | MacBookAir       | 07:07 | MacBook Air (wired) |
| 192.168.1.101 | Desktop-Gigabyte | f1:70 | DESKTOP-23QVBVH |
| 192.168.1.102 | DEZE134          | 7c:10 | DEZE134 |
| 192.168.1.130 | Chromecast-1     | 5f:8b | Chromecast Ultra |
| 192.168.1.131 | Chromecast-2     | c0:01 | Chromecast Ultra (localdomain) |
| 192.168.1.132 | Amazon-TV        | 66:3a | Amazon device (Echo/Fire TV) |
| 192.168.1.200 | nas              | 8f:d9 | NAS — 0001_badenai (**fix lease after reserving**) |
| 192.168.1.210 | proxmox          | 84:b1 | Proxmox host — WIN-NABR8IC4TU6 (**change from .110, update Terraform**) |

#### No fixed IP (dynamic is fine)

| Device | Reason |
|--------|--------|
| iPhone, Huawei Mate 20 Pro, 14:eb:…, 4c:60:…, SCharger, A55-von-Laura | Mobile/transient |
| d4:d8:53:d6:0a:1f | Wired device behind OG AP — identify before reserving |
| DESKTOP-F33E9RU | Moving to VLAN 10 (see below) |
| 0001_badenai 0e:e6 | Proxmox VM — moving to VLAN 10 |

---

### VLAN 10 — 192.168.10.0/24 (Private Servers)

These devices are Proxmox VMs. Once the VLAN is set up, they get VLAN 10 tags in Proxmox and receive IPs from the VLAN 10 DHCP pool. Assign fixed IPs in UniFi after they first connect on the new VLAN.

| IP | Hostname | Device |
|----|----------|--------|
| 192.168.10.10 | windows-vm | DESKTOP-F33E9RU (Windows VM) |
| 192.168.10.11 | badenai-vm | 0001_badenai 0e:e6 (Proxmox VM) |

> **UniFi Teleport note:** Teleport is a WireGuard VPN that terminates at the UDM Pro.
> Once connected, your traffic is routed by the UDM Pro — which is the gateway for all VLANs.
> You can reach VLAN 10 devices (e.g. Windows VM at 192.168.10.10) over Teleport without
> any extra configuration. The optional "Block Private Servers → Internet" firewall rule
> (Rule 3 below) only blocks *outbound* traffic from VLAN 10 to WAN — it does not block
> inbound Teleport sessions, so RDP/file sharing to the Windows VM will work normally.

---

### VLAN 20 — 192.168.20.0/24 (DMZ)

| IP | Device |
|----|--------|
| 192.168.20.2  | Reverse proxy (Caddy) |
| 192.168.20.10 | Omnis CT |

---

## Phase 1: Create VLANs in UniFi

### 1.1 — Create the Networks

UniFi UI → Settings → Networks → **Create New Network**

| Name            | VLAN ID | Subnet           | DHCP Range   |
|-----------------|---------|------------------|--------------|
| Servers-Private | 10      | 192.168.10.1/24  | .100–.200    |
| DMZ             | 20      | 192.168.20.1/24  | .100–.200    |

For each network:
- Network Type: **Standard**
- VLAN-only: **off** (you want routing + DHCP)
- IGMP Snooping: off

### 1.2 — Configure the Proxmox Switch Port (trunk)

Proxmox's port on the USW Flex XG (Port 2) must carry all three VLANs.

**Create a Port Profile:**

UniFi UI → Settings → Profiles → Port Profiles → **Create Port Profile**

- Name: `Proxmox-Trunk`
- Native Network: **Default** (VLAN 1 — Proxmox management stays at 192.168.1.110)
- Tagged Networks: **Servers-Private** (VLAN 10) + **DMZ** (VLAN 20)

**Apply it:**

UniFi UI → Devices → USW Flex XG → Ports → **Port 2** → Port Profile: `Proxmox-Trunk`

All other ports (MacBook Air on Port 3, NAS on Port 4) stay on the **Default** profile.

### 1.3 — Set Fixed IP Reservations

For each device in the allocation table above:

UniFi UI → Clients → click device → **IP Settings** → enable Fixed IP Address → enter IP → Save

Work through the table top to bottom. The NAS (`0001_badenai 8f:d9`) already has `.200` reserved but is still showing `.237` — after saving, force a DHCP renewal:

```bash
# On the NAS (Linux)
dhclient -r && dhclient

# Or from UniFi: Clients → 0001_badenai 8f:d9 → Quick Actions → Reconnect
```

### 1.4 — Firewall Rules

UniFi UI → Settings → Firewall & Security → **Create New Rule**

**Rule 1 — Block DMZ → Trusted LAN**
- Type: LAN In | Action: Drop
- Source: Network = DMZ (VLAN 20)
- Destination: Network = Default (VLAN 1)

**Rule 2 — Block DMZ → Private Servers**
- Type: LAN In | Action: Drop
- Source: Network = DMZ (VLAN 20)
- Destination: Network = Servers-Private (VLAN 10)

**Rule 3 — Block Private Servers → Internet** *(optional — skip if you want internet on the Windows VM)*
- Type: LAN Out | Action: Drop
- Source: Network = Servers-Private (VLAN 10)
- Destination: WAN

**Rule 4 — Protect Proxmox UI**
- Type: LAN In | Action: Drop
- Source: Network = DMZ (VLAN 20)
- Destination: IP = 192.168.1.210, Port = 8006

### 1.5 — Port Forwarding

UniFi UI → Settings → Firewall & Security → Port Forwarding → **Create**

| WAN Port | Forward To                  | Purpose   |
|----------|-----------------------------|-----------|
| 80       | 192.168.20.2 (Caddy)        | HTTP      |
| 443      | 192.168.20.2 (Caddy)        | HTTPS/TLS |

Never forward ports directly to containers — everything goes through Caddy.

---

## Phase 2: Configure Proxmox

### 2.1 — Enable VLAN Aware on the Bridge

Proxmox UI → your node → Network → click `vmbr0` → Edit

- Check **VLAN aware** → OK → **Apply Configuration**

Proxmox management stays reachable at 192.168.1.110 throughout — VLAN 1 is native/untagged.

### 2.2 — Assign VMs and Containers to VLANs

Proxmox UI → VM or container → Network → edit `eth0` → set VLAN tag

| Device              | VLAN Tag | Target IP          |
|---------------------|----------|--------------------|
| Windows VM (F33E9RU) | 10      | 192.168.10.10      |
| badenai VM (0e:e6)  | 10       | 192.168.10.11      |
| Omnis CT            | 20       | 192.168.20.10      |
| Reverse proxy CT    | 20       | 192.168.20.2       |

Restart each container/VM after changing the VLAN tag, then set the fixed IP reservation in UniFi once it appears on the new VLAN.

---

## Phase 3: Update Terraform

In `deploy/terraform/terraform.tfvars`:

```hcl
container_ip     = "192.168.20.10/24"
container_host   = "192.168.20.10"
gateway          = "192.168.20.1"
```

In `main.tf`:

```hcl
network_interface {
  name    = "eth0"
  bridge  = "vmbr0"
  vlan_id = 20
}
```

---

## Phase 4: Set Up Reverse Proxy (Caddy)

Run Caddy inside the reverse proxy CT at 192.168.20.2.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy
```

`/etc/caddy/Caddyfile`:

```
omnis.yourdomain.com {
    reverse_proxy 192.168.20.10:8420
}
```

```bash
systemctl enable --now caddy
```

Point your domain DNS A record to your WAN IP. Caddy handles TLS via Let's Encrypt.

---

## Phase 5: Verify

```
✓ Proxmox UI reachable at 192.168.1.210:8006             (new fixed IP applied)
✓ NAS reachable at 192.168.1.200                          (fixed IP reservation applied)
✓ Windows VM reachable at 192.168.10.10 over Teleport    (VLAN 10 + Teleport VPN)
✓ From Omnis CT (VLAN 20): cannot ping 192.168.1.x       (LAN blocked by Rule 1)
✓ From Omnis CT (VLAN 20): cannot reach 192.168.10.x     (private servers blocked by Rule 2)
✓ From Omnis CT (VLAN 20): can reach internet
✓ Proxmox UI not reachable from VLAN 20                  (Rule 4)
✓ https://omnis.yourdomain.com loads from internet
```

---

## Summary

| Layer        | Responsibility                                              |
|--------------|-------------------------------------------------------------|
| UDM Pro      | VLANs, DHCP, fixed IPs, firewall rules, port forwarding, Teleport VPN |
| USW Flex XG  | Trunk profile on Proxmox port; other ports stay on Default  |
| Proxmox      | VLAN tags on VMs/containers only                            |
| Caddy        | TLS termination, routing to internal services               |
| Terraform    | `vlan_id` on new containers                                 |
