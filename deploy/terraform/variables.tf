variable "proxmox_endpoint" {
  type        = string
  description = "Proxmox API endpoint, e.g. https://192.168.1.100:8006"
}

variable "proxmox_api_token" {
  type        = string
  sensitive   = true
  description = "Proxmox API token, e.g. root@pam!terraform=<secret>"
}

variable "proxmox_node" {
  type        = string
  default     = "pve"
  description = "Proxmox node name"
}

variable "container_id" {
  type        = number
  default     = 200
  description = "LXC container VM ID"
}

variable "container_ip" {
  type        = string
  description = "Container IP in CIDR notation, e.g. 192.168.20.10/24"
}

variable "container_host" {
  type        = string
  description = "Container bare IP for SSH, e.g. 192.168.20.10"
}

variable "gateway" {
  type        = string
  description = "Network gateway IP, e.g. 192.168.20.1"
}

variable "git_repo" {
  type        = string
  description = "Git repo URL to clone, e.g. git@github.com:you/omnis.git"
}

variable "github_ssh_key" {
  type        = string
  sensitive   = true
  description = "Path to SSH private key for GitHub access, e.g. ~/.ssh/id_ed25519_github"
  default     = "~/.ssh/id_ed25519_github"
}

variable "gemini_api_key" {
  type        = string
  sensitive   = true
  description = "Google Gemini API key"
}

variable "proxmox_ssh_host" {
  type        = string
  description = "Proxmox host bare IP for SSH, e.g. 192.168.1.200"
}

variable "caddy_container_id" {
  type        = number
  default     = 201
  description = "LXC container VM ID for Caddy reverse proxy"
}

variable "caddy_container_ip" {
  type        = string
  description = "Caddy container IP in CIDR notation, e.g. 192.168.20.2/24"
}

variable "caddy_container_host" {
  type        = string
  description = "Caddy container bare IP for SSH, e.g. 192.168.20.2"
}

variable "domain" {
  type        = string
  description = "Public domain name for Omnis, e.g. omnis.yourdomain.com"
}
