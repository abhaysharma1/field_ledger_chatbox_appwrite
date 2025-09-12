$aud = storacha whoami
storacha delegation create $aud `
  --can 'space/blob/add' `
  --can 'space/index/add' `
  --can 'upload/add' `
  --base64 | Out-File -Encoding ascii proof.base64
