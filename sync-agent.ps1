Set-StrictMode -Off
$ErrorActionPreference = "Stop"

$winHome = $HOME -replace '\\', '/'
$wslHome = '/mnt/' + $winHome[0].ToString().ToLower() + $winHome.Substring(2)
$wslSshKey = "$wslHome/.ssh/id_ed25519_deploy"

$wslOmnisDir = "$wslHome/.omnis/agents"
bash deploy/sync-agent.sh "--ssh-key=$wslSshKey" "--local-agents-dir=$wslOmnisDir" @args
