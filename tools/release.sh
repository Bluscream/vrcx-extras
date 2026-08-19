#!/usr/bin/env bash
# tools/release.sh — lint, build, bump, commit, push, and release vrcx-extras
# Usage: ./tools/release.sh [options]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

# ─── defaults ──────────────────────────────────────────────────────────────────
DO_BUMP=""
DO_LINT=false
DO_BUILD=false
DO_COMMIT=false
DO_PUSH=false
DO_RELEASE=false
DRY_RUN=false

# ─── argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --bump)
            shift
            DO_BUMP="${1:-patch}"
            ;;
        --bump=*)
            DO_BUMP="${1#--bump=}"
            ;;
        --lint)     DO_LINT=true ;;
        --build)    DO_BUILD=true ;;
        --commit)   DO_COMMIT=true ;;
        --push)     DO_PUSH=true ;;
        --release)  DO_RELEASE=true; DO_BUILD=true; DO_PUSH=true; DO_COMMIT=true ;;
        --dry-run)  DRY_RUN=true ;;
        -h|--help)
            cat <<EOF
Usage: $0 [options]

  --lint              Run TypeScript typecheck only (no build)
  --build             Full build: typecheck → vite frontend → Linux binary →
                      Windows binary → AppImage
  --bump <level>      Bump version in package.json: patch | minor | major
  --commit            git add -A, commit with version message, create git tag
  --push              Push branch + tag to origin
  --release           Create GitHub release with all build artifacts
                      (implies --build --commit --push)
  --dry-run           Print every command without executing anything

Examples:
  $0 --lint
  $0 --build
  $0 --bump patch --build --commit --push
  $0 --bump minor --release
EOF
            exit 0
            ;;
        *)
            echo "[!] Unknown flag: $1" >&2
            exit 1
            ;;
    esac
    shift
done

# ─── helpers ──────────────────────────────────────────────────────────────────
run() {
    if $DRY_RUN; then
        echo "[dry-run] $*"
    else
        echo "[+] $*"
        "$@"
    fi
}

get_version() {
    node -p "require('./package.json').version"
}

bump_version() {
    local level="$1"
    local current
    current="$(get_version)"
    IFS='.' read -r major minor patch <<< "$current"
    case "$level" in
        major) major=$((major + 1)); minor=0; patch=0 ;;
        minor) minor=$((minor + 1)); patch=0 ;;
        patch) patch=$((patch + 1)) ;;
        *)
            echo "[!] Unknown bump level: $level (use patch, minor, or major)" >&2
            exit 1
            ;;
    esac
    local new_version="$major.$minor.$patch"
    echo "[*] Bumping version: $current → $new_version" >&2
    if ! $DRY_RUN; then
        node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            pkg.version = '$new_version';
            fs.writeFileSync('package.json', JSON.stringify(pkg, null, 4) + '\n');
        "
    fi
    echo "$new_version"
}

build_appimage() {
    local APPIMAGE_TOOL="build/appimagetool"
    local APPDIR="build/AppDir"
    local BINARY="build/vrcx-extras"
    local OUT="build/VRCX-Extras-x86_64.AppImage"

    if [[ ! -f "$APPIMAGE_TOOL" ]]; then
        echo "[!] $APPIMAGE_TOOL not found — skipping AppImage" >&2
        return
    fi

    echo "[*] Assembling AppDir…"
    run mkdir -p "$APPDIR/usr/bin"
    run cp "$BINARY" "$APPDIR/usr/bin/vrcx-extras"

    echo "[*] Building AppImage → $OUT"
    if $DRY_RUN; then
        echo "[dry-run] ARCH=x86_64 $APPIMAGE_TOOL --no-appstream $APPDIR $OUT"
    else
        ARCH=x86_64 "$APPIMAGE_TOOL" --no-appstream "$APPDIR" "$OUT" 2>&1
        echo "[*] AppImage: $OUT ($(du -sh "$OUT" | cut -f1))"
    fi
}

# ─── banner ────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════╗"
echo "║        vrcx-extras release tool      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# 1. Bump version
VERSION=""
if [[ -n "$DO_BUMP" ]]; then
    VERSION="$(bump_version "$DO_BUMP")"
else
    VERSION="$(get_version)"
    echo "[*] Using current version: $VERSION"
fi

TAG="v$VERSION"

# 2. Lint (typecheck only)
if $DO_LINT && ! $DO_BUILD; then
    echo ""
    echo "[*] Linting (TypeScript typecheck)…"
    run npm run typecheck
    echo "[*] Lint passed ✓"
fi

# 3. Full build
if $DO_BUILD; then
    echo ""
    echo "[*] Step 1/5 — TypeScript typecheck…"
    run npm run typecheck

    echo "[*] Step 2/5 — Vite frontend build…"
    run npm run build

    echo "[*] Step 3/5 — Linux binary (vrcx-extras)…"
    run npm run package:linux

    echo "[*] Step 4/5 — Windows binary (vrcx-extras.exe)…"
    run npm run package:win

    echo "[*] Step 5/5 — AppImage (VRCX-Extras-x86_64.AppImage)…"
    build_appimage

    echo ""
    echo "[*] Build complete. Artifacts in build/:"
    if ! $DRY_RUN; then
        ls -lh build/vrcx-extras build/vrcx-extras.exe build/VRCX-Extras-x86_64.AppImage 2>/dev/null || true
    fi
elif $DO_COMMIT && ! $DO_LINT; then
    # Typecheck at minimum before any commit
    echo ""
    echo "[*] Running typecheck before commit…"
    run npm run typecheck
fi

# 4. Commit + tag
if $DO_COMMIT; then
    echo ""
    echo "[*] Staging and committing…"
    if ! $DRY_RUN; then
        git add -A
        if git diff --cached --quiet; then
            echo "    (nothing new to commit)"
        else
            git commit -m "chore: release $TAG"
            echo "[+] Committed: chore: release $TAG"
        fi
        git tag -a "$TAG" -m "Release $TAG"
        echo "[+] Tagged: $TAG"
    else
        echo "[dry-run] git add -A && git commit -m 'chore: release $TAG' && git tag -a $TAG -m 'Release $TAG'"
    fi
fi

# 5. Push
if $DO_PUSH; then
    echo ""
    echo "[*] Pushing branch and tags to origin…"
    run git push origin HEAD
    run git push origin "$TAG"
fi

# 6. GitHub Release
if $DO_RELEASE; then
    echo ""
    echo "[*] Creating GitHub release $TAG…"

    ARTIFACTS=()
    [[ -f "build/vrcx-extras" ]]                      && ARTIFACTS+=("build/vrcx-extras")
    [[ -f "build/vrcx-extras.exe" ]]                  && ARTIFACTS+=("build/vrcx-extras.exe")
    [[ -f "build/VRCX-Extras-x86_64.AppImage" ]]      && ARTIFACTS+=("build/VRCX-Extras-x86_64.AppImage")

    if [[ ${#ARTIFACTS[@]} -eq 0 ]]; then
        echo "[!] No artifacts found in build/ — did you pass --build?" >&2
        exit 1
    fi

    GH_ARGS=(
        release create "$TAG"
        --title "vrcx-extras $TAG"
        --generate-notes
    )
    for artifact in "${ARTIFACTS[@]}"; do
        GH_ARGS+=("$artifact")
    done

    if command -v gh &>/dev/null; then
        run gh "${GH_ARGS[@]}"
    else
        echo "[!] 'gh' CLI not found. Install: https://cli.github.com"
        echo "    Then run: gh ${GH_ARGS[*]}"
    fi
fi

echo ""
echo "[✓] Done! Version: $TAG"
echo ""
