Uploads directory guidance
=========================

The server writes raw caregiver audio/video to an uploads directory. On some hosts
(containers, Render, ephemeral file systems) creating directories under root
like `/data` may fail with EACCES. The server now attempts to create the
configured `UPLOADS_DIR` and will fall back to a per-process temp directory
if that fails.

Environment
-----------

- Set `UPLOADS_DIR` to a writable path (preferred). Example for Docker / host:

```powershell
# Windows / PowerShell (host)
$env:UPLOADS_DIR = 'C:\neurosync\uploads'

# Linux / shell
export UPLOADS_DIR=/var/neurosync/uploads
```

Container / CI notes
--------------------

- Ensure the directory exists and is owned by the runtime user. Example Dockerfile:

```dockerfile
RUN mkdir -p /data/uploads && chown -R node:node /data/uploads
```

- On platforms without persistent volumes (free tiers), the process will use
  the OS temporary directory. This is safe but files won't persist across restarts.
