#!/bin/sh
set -e

# Fix permissions for data directory
if [ -d "/app/data" ]; then
    chown -R nodejs:nodejs /app/data
fi

# Execute the command as nodejs user
exec su-exec nodejs "$@"
