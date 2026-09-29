// Package flux embeds the web client so the server ships as one self-contained
// binary with no external file dependency. Set FLUX_WEB_DIR to serve from disk
// instead (development / live-editing the frontend).
package flux

import "embed"

//go:embed web
var WebFS embed.FS
