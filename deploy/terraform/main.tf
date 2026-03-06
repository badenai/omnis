terraform {
  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = "~> 0.78"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

provider "proxmox" {
  endpoint  = var.proxmox_endpoint
  api_token = var.proxmox_api_token
  insecure  = true # self-signed cert
  ssh {
    agent    = true
    username = "root"
  }
}

# Download Ubuntu 22.04 LXC template
resource "proxmox_virtual_environment_download_file" "ubuntu_lxc" {
  content_type = "vztmpl"
  datastore_id = "local"
  node_name    = var.proxmox_node
  url          = "http://download.proxmox.com/images/system/ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
}

# Omnis container (VLAN 20, 192.168.20.10)
resource "proxmox_virtual_environment_container" "omnis" {
  description  = "Omnis — knowledge agent system"
  node_name    = var.proxmox_node
  vm_id        = var.container_id
  unprivileged = true

  cpu { cores = 2 }

  memory {
    dedicated = 1024
    swap      = 512
  }

  disk {
    datastore_id = "local-lvm"
    size         = 10
  }

  mount_point {
    volume = "local-lvm"
    size   = "5G"
    path   = "/root/.omnis"
  }

  operating_system {
    template_file_id = proxmox_virtual_environment_download_file.ubuntu_lxc.id
    type             = "ubuntu"
  }

  initialization {
    hostname = "omnis"
    ip_config {
      ipv4 {
        address = var.container_ip
        gateway = var.gateway
      }
    }
    user_account {
      keys = [trimspace(file(pathexpand("~/.ssh/id_ed25519_deploy.pub")))]
    }
  }

  network_interface {
    name    = "eth0"
    bridge  = "vmbr0"
    vlan_id = 20
  }
}

# Caddy container (VLAN 20, 192.168.20.2)
resource "proxmox_virtual_environment_container" "caddy" {
  description  = "Caddy — reverse proxy and TLS termination"
  node_name    = var.proxmox_node
  vm_id        = var.caddy_container_id
  unprivileged = true

  cpu { cores = 1 }

  memory {
    dedicated = 256
    swap      = 0
  }

  disk {
    datastore_id = "local-lvm"
    size         = 4
  }

  operating_system {
    template_file_id = proxmox_virtual_environment_download_file.ubuntu_lxc.id
    type             = "ubuntu"
  }

  initialization {
    hostname = "caddy"
    ip_config {
      ipv4 {
        address = var.caddy_container_ip
        gateway = var.gateway
      }
    }
    user_account {
      keys = [trimspace(file(pathexpand("~/.ssh/id_ed25519_deploy.pub")))]
    }
  }

  network_interface {
    name    = "eth0"
    bridge  = "vmbr0"
    vlan_id = 20
  }
}

# Bootstrap Omnis — runs on Proxmox host via SSH, no SSH needed inside container
resource "null_resource" "omnis_bootstrap" {
  depends_on = [proxmox_virtual_environment_container.omnis]

  triggers = {
    script_hash    = sha256(templatefile("${path.module}/scripts/omnis-bootstrap.sh.tpl", {
      gemini_api_key = var.gemini_api_key
    }))
    container_id   = proxmox_virtual_environment_container.omnis.id
  }

  connection {
    type        = "ssh"
    host        = var.proxmox_ssh_host
    user        = "root"
    private_key = file(pathexpand("~/.ssh/id_ed25519_deploy"))
  }

  provisioner "file" {
    content = templatefile("${path.module}/scripts/omnis-bootstrap.sh.tpl", {
      gemini_api_key = var.gemini_api_key
    })
    destination = "/tmp/omnis-bootstrap.sh"
  }

  provisioner "remote-exec" {
    inline = [
      "pct push ${var.container_id} /tmp/omnis-bootstrap.sh /tmp/bootstrap.sh",
      "pct exec ${var.container_id} -- bash /tmp/bootstrap.sh",
    ]
  }
}

# Bootstrap Caddy — runs on Proxmox host via SSH, no SSH needed inside container
resource "null_resource" "caddy_bootstrap" {
  depends_on = [proxmox_virtual_environment_container.caddy]

  triggers = {
    script_hash  = sha256(templatefile("${path.module}/scripts/caddy-bootstrap.sh.tpl", {
      domain   = var.domain
      omnis_ip = var.container_host
      users    = var.caddy_users
    }))
    container_id = proxmox_virtual_environment_container.caddy.id
  }

  connection {
    type        = "ssh"
    host        = var.proxmox_ssh_host
    user        = "root"
    private_key = file(pathexpand("~/.ssh/id_ed25519_deploy"))
  }

  provisioner "file" {
    content = templatefile("${path.module}/scripts/caddy-bootstrap.sh.tpl", {
      domain   = var.domain
      omnis_ip = var.container_host
      users    = var.caddy_users
    })
    destination = "/tmp/caddy-bootstrap.sh"
  }

  provisioner "remote-exec" {
    inline = [
      "pct push ${var.caddy_container_id} /tmp/caddy-bootstrap.sh /tmp/bootstrap.sh",
      "pct exec ${var.caddy_container_id} -- bash /tmp/bootstrap.sh",
    ]
  }
}

output "omnis_ip" {
  value = var.container_host
}

output "caddy_ip" {
  value = var.caddy_container_host
}
