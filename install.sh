#!/usr/bin/env bash
#
# m3u4me installer — for Linux systems running systemd with apt or dnf
# (Debian, Ubuntu, Fedora, and containers based on them).
#
#   curl -fsSL https://raw.githubusercontent.com/andrei-savin/m3u4me/main/install.sh | sudo bash
#
# Re-running this script is safe — it updates an existing install in place and
# never touches /opt/m3u4me/data, which is where your playlists live.
#
# What it does:
#   1. Makes sure Node.js 22.18+, git and curl are installed. If Node.js has to be
#      installed, it comes from NodeSource's package repository, which is added
#      to your system so Node.js gets updates like any other package.
#   2. Creates a locked-down "m3u4me" system user to run the app
#   3. Downloads m3u4me to /opt/m3u4me at the latest release
#   4. Builds the app and starts it as a systemd service
#   5. Saves the port in /etc/m3u4me.env and installs the "m3u4me" command
#      to /usr/local/bin

# -E so the error trap below also fires for failures inside functions and subshells.
set -Eeuo pipefail

REPO_URL="${M3U4ME_REPO:-https://github.com/andrei-savin/m3u4me.git}"
APP_DIR="/opt/m3u4me"
APP_USER="m3u4me"
SERVICE_NAME="m3u4me"
ENV_FILE="/etc/m3u4me.env"
CLI_PATH="/usr/local/bin/m3u4me"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NODE_MIN_VERSION="22.18"
NODE_SETUP_MAJOR=22
# Only set when you pass PORT=... yourself, so it can be told apart from the default.
REQUESTED_PORT="${PORT:-}"

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m xx\033[0m %s\n' "$*" >&2; exit 1; }

# Never fail quietly — a half-finished install is worse than a clear error.
trap 'die "Installation failed on line ${LINENO}. Once the problem is fixed, re-running this script is safe."' ERR

# ── Helpers ──────────────────────────────────────────────────────────────────

PKG=none
APT_UPDATED=0
install_pkg() {
  case "$PKG" in
    apt)
      if [ "$APT_UPDATED" -eq 0 ]; then
        DEBIAN_FRONTEND=noninteractive apt-get update -qq
        APT_UPDATED=1
      fi
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null
      ;;
    dnf) dnf install -y -q "$@" >/dev/null ;;
    *)   die "Cannot auto-install: $*. Please install it manually, then re-run this script." ;;
  esac
}

# Runs a command as the m3u4me user, from inside the app folder. npm runs this
# way so that package install scripts never run as root. git runs this way too:
# the folder belongs to the m3u4me user, and git refuses to work in a folder
# owned by someone else.
run_as_app() {
  if command -v runuser >/dev/null 2>&1; then
    ( cd "$APP_DIR" && runuser -u "$APP_USER" -- env HOME="$APP_DIR" npm_config_cache="$APP_DIR/.npm" "$@" )
  else
    ( cd "$APP_DIR" && sudo -u "$APP_USER" env HOME="$APP_DIR" npm_config_cache="$APP_DIR/.npm" "$@" )
  fi
}

# m3u4me runs server.ts directly with plain node, which relies on Node's built-in
# TypeScript type stripping. That is only switched on by default from Node 22.18
# (and 23.6 on the short-lived 23.x line) — older versions refuse to start it.
node_is_new_enough() {
  command -v node >/dev/null 2>&1 || return 1
  node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    const ok = major >= 24 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18);
    process.exit(ok ? 0 : 1);
  ' 2>/dev/null
}

# Reads the port from the settings file. PORT is cleared first so a PORT=...
# passed to this script can't be mistaken for the saved one.
read_port() {
  ( unset PORT; . "$ENV_FILE" >/dev/null 2>&1 || true; echo "${PORT:-8080}" )
}

# Waits up to a minute for the service to be up and actually answering web
# requests. "systemctl restart" reports success as soon as the process launches,
# even if the app crashes a second later, so that alone proves nothing.
# (The m3u4me command has the same check.)
wait_until_running() {
  local port="$1" tries=60
  while [ "$tries" -gt 0 ]; do
    if systemctl is-active --quiet "$SERVICE_NAME" \
      && curl -fsS -o /dev/null --max-time 3 "http://127.0.0.1:${port}/api/auth/status"; then
      return 0
    fi
    sleep 1
    tries=$((tries - 1))
  done
  return 1
}

# ── Steps ────────────────────────────────────────────────────────────────────

preflight() {
  [ "$(id -u)" -eq 0 ] || die "Please run this as root, e.g. pipe it into 'sudo bash'."
  [ "$(uname -s)" = "Linux" ] || die "This installer is Linux-only. On macOS or Windows, use the Docker install instead."
  [ -d /run/systemd/system ] || die "systemd was not detected on this system. Use the Docker install instead."

  if command -v apt-get >/dev/null 2>&1; then
    PKG=apt
  elif command -v dnf >/dev/null 2>&1; then
    PKG=dnf
  fi
}

ensure_node() {
  if node_is_new_enough; then
    say "Node $(node -v) is already installed."
    return
  fi

  if command -v node >/dev/null 2>&1; then
    say "Node $(node -v) is too old (need ${NODE_MIN_VERSION}+). Upgrading ..."
  else
    say "Installing Node.js ${NODE_SETUP_MAJOR}.x ..."
  fi

  # The Node.js in Debian's and Ubuntu's own repositories is too old, so this
  # comes from NodeSource, the packaging the Node.js website points to.
  case "$PKG" in
    apt)
      install_pkg ca-certificates curl gnupg
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_SETUP_MAJOR}.x" | bash - >/dev/null
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null
      ;;
    dnf)
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_SETUP_MAJOR}.x" | bash - >/dev/null
      dnf install -y -q nodejs >/dev/null
      ;;
    *)
      die "Please install Node.js ${NODE_MIN_VERSION} or newer manually, then re-run this script."
      ;;
  esac

  # Forget where bash last found "node", then check again — the install can
  # succeed while an older Node.js elsewhere on the PATH still wins.
  hash -r
  node_is_new_enough || die "Node.js was installed, but '$(command -v node || echo node)' is still older than ${NODE_MIN_VERSION}. Another copy of Node.js is probably in the way. Remove it, then re-run this script."
  say "Installed Node $(node -v)."
}

create_user() {
  if ! id -u "$APP_USER" >/dev/null 2>&1; then
    say "Creating the '$APP_USER' system user ..."
    local nologin="/usr/sbin/nologin"
    [ -x "$nologin" ] || nologin="/sbin/nologin"
    [ -x "$nologin" ] || nologin="/bin/false"
    useradd --system --home-dir "$APP_DIR" --shell "$nologin" "$APP_USER"
  fi
}

fetch_release() {
  mkdir -p "$APP_DIR/data"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"

  if [ -d "$APP_DIR/.git" ]; then
    say "Existing install found — updating it ..."
  else
    say "Downloading m3u4me to $APP_DIR ..."
    # "git init" rather than "git clone", because clone refuses to write into a
    # folder that already has something in it — which is exactly the case when
    # reinstalling after an uninstall that kept your data.
    run_as_app git init --quiet .
  fi

  # Written this way so it also recovers from an earlier run that was interrupted
  # before it finished setting the repository up.
  run_as_app git remote set-url origin "$REPO_URL" 2>/dev/null \
    || run_as_app git remote add origin "$REPO_URL"

  run_as_app git fetch --tags --force --quiet origin

  # The release tag with the highest version number, e.g. v2.2.0.
  TAG="$(run_as_app git for-each-ref --sort=-version:refname --count=1 --format='%(refname:short)' 'refs/tags/v*')"
  [ -n "$TAG" ] || die "No release tags found in the repository."

  # --force discards local edits to tracked files. Your data lives in data/, which
  # git ignores, so it is never affected by this.
  run_as_app git checkout --quiet --force "$TAG"
  say "Installing release $TAG."
}

build_app() {
  say "Installing dependencies (this can take a minute) ..."
  run_as_app npm ci --no-audit --no-fund --loglevel=error

  say "Building the app ..."
  run_as_app npm run build

  [ -f "$APP_DIR/dist/index.html" ] || die "The build did not produce a dist/ folder. Nothing was started."
}

write_settings() {
  # Only written on a fresh install, so re-running the script never overwrites a
  # port you have customised.
  if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" <<EOF
# m3u4me settings.
# After changing anything here, run:  sudo m3u4me restart
PORT=${REQUESTED_PORT:-8080}
EOF
  fi

  PORT_IN_USE="$(read_port)"

  if [ -n "$REQUESTED_PORT" ] && [ "$REQUESTED_PORT" != "$PORT_IN_USE" ]; then
    warn "m3u4me is already set up to use port ${PORT_IN_USE}, so PORT=${REQUESTED_PORT} was ignored."
    warn "To change the port, edit ${ENV_FILE}, then run:  sudo m3u4me restart"
  fi
}

install_service() {
  local node_bin
  node_bin="$(command -v node)"

  cat > "$UNIT_FILE" <<EOF
[Unit]
Description=m3u4me — self-hosted M3U playlist manager
Documentation=https://github.com/andrei-savin/m3u4me
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
# server.ts resolves both data/ and dist/ relative to the working directory.
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production
ExecStart=${node_bin} server.ts
Restart=on-failure
RestartSec=5

# The app only ever writes to data/, so everything else can stay read-only.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}/data

[Install]
WantedBy=multi-user.target
EOF

  say "Starting the m3u4me service ..."
  systemctl daemon-reload
  systemctl enable --quiet "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
}

install_cli() {
  # The m3u4me command ships inside each release, while this script always comes
  # from the newest code on GitHub. If the newest release is older than the
  # command, skip it rather than failing an install that otherwise works.
  if [ -f "$APP_DIR/scripts/m3u4me" ]; then
    install -m 0755 "$APP_DIR/scripts/m3u4me" "$CLI_PATH"
    HAVE_CLI=1
  else
    warn "Release ${TAG} does not include the m3u4me command yet. To update later, re-run the install command."
    HAVE_CLI=0
  fi
}

print_summary() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$ip" ] || ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')"
  [ -n "$ip" ] || ip="your-server-ip"

  echo
  say "m3u4me ${TAG} is installed and running."
  echo
  echo "    Open it at:   http://${ip}:${PORT_IN_USE}"
  echo
  if [ "$HAVE_CLI" -eq 1 ]; then
    echo "    Update:       sudo m3u4me update"
    echo "    Status:       m3u4me status"
    echo "    Logs:         sudo m3u4me logs"
  else
    echo "    Update:       re-run the install command"
    echo "    Logs:         sudo journalctl -u ${SERVICE_NAME} -f"
  fi
  echo "    Settings:     ${ENV_FILE}"
  echo
}

# Everything happens inside main(), which is only called on the very last line.
# When this script is piped from curl, bash starts running it before the download
# has finished. Wrapped like this, a dropped connection can't run half a script.
main() {
  preflight

  say "Checking prerequisites ..."
  command -v git >/dev/null 2>&1 || install_pkg git
  command -v curl >/dev/null 2>&1 || install_pkg curl
  ensure_node

  create_user
  fetch_release
  build_app
  write_settings
  install_service
  install_cli

  say "Waiting for m3u4me to start ..."
  wait_until_running "$PORT_IN_USE" \
    || die "The service did not start. Check what went wrong with:  sudo journalctl -u ${SERVICE_NAME} -n 50 --no-pager"

  print_summary
}

main "$@"
