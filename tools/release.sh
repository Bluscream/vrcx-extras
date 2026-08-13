#!/usr/bin/env bash
# tools/release.sh — bump, commit, push, package and release vrcx-extras
# Usage: ./tools/release.sh [--bump patch|minor|major] [--commit] [--push] [--deploy] [--release] [--dry-run]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

# ─── defaults ──────────────────────────────────────────────────────────────────
DO_BUMP=""
DO_COMMIT=false
DO_PUSH=false
DO_DEPLOY=false
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
        --commit)   DO_COMMIT=true ;;
        --push)     DO_PUSH=true ;;
        --deploy)   DO_DEPLOY=true ;;
        --release)  DO_RELEASE=true; DO_PUSH=true; DO_COMMIT=true ;;
        --dry-run)  DRY_RUN=true ;;
        -h|--help)
            echo "Usage: $0 [--bump patch|minor|major] [--commit] [--push] [--deploy] [--release] [--dry-run]"
            echo ""
            echo "  --bump <level>  Bump the version in package.json (patch / minor / major)"
            echo "  --commit        Stage all changes and create a version commit"
            echo "  --push          Push the branch and tags to origin"
            echo "  --deploy        Build binaries (package:all) after bumping"
            echo "  --release       Create a GitHub release with built artifacts (implies --push --commit)"
            echo "  --dry-run       Print commands instead of running them"
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
        # Update package.json
        node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            pkg.version = '$new_version';
            fs.writeFileSync('package.json', JSON.stringify(pkg, null, 4) + '\n');
        "
    fi
    echo "$new_version"
}

# ─── main ──────────────────────────────────────────────────────────────────────
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

# 2. Build
if $DO_DEPLOY || $DO_RELEASE; then
    echo ""
    echo "[*] Building production binaries…"
    run npm run build
    run npm run package:all
    echo "[*] Build artifacts written to build/"
elif $DO_COMMIT; then
    # At minimum typecheck before committing
    echo ""
    echo "[*] Running typecheck before commit…"
    run npm run typecheck
fi

# 3. Commit
if $DO_COMMIT; then
    echo ""
    echo "[*] Staging and committing…"
    if ! $DRY_RUN; then
        git add -A
        if git diff --cached --quiet; then
            echo "    (nothing to commit)"
        else
            run git commit -m "chore: release $TAG"
        fi
        run git tag -a "$TAG" -m "Release $TAG"
    else
        echo "[dry-run] git add -A && git commit -m 'chore: release $TAG' && git tag -a $TAG -m 'Release $TAG'"
    fi
fi

# 4. Push
if $DO_PUSH; then
    echo ""
    echo "[*] Pushing branch and tags…"
    run git push origin HEAD
    run git push origin "$TAG"
fi

# 5. GitHub Release
if $DO_RELEASE; then
    echo ""
    echo "[*] Creating GitHub release $TAG…"

    # Collect artifacts
    ARTIFACTS=()
    if [[ -f "build/vrcx-extras" ]];     then ARTIFACTS+=("build/vrcx-extras"); fi
    if [[ -f "build/vrcx-extras.exe" ]]; then ARTIFACTS+=("build/vrcx-extras.exe"); fi

    if [[ ${#ARTIFACTS[@]} -eq 0 ]]; then
        echo "[!] No artifacts found in build/ — did you pass --deploy?" >&2
        exit 1
    fi

    # Build gh release command
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
        echo "[!] 'gh' CLI not found. Install it from https://cli.github.com and run:"
        echo "    gh ${GH_ARGS[*]}"
    fi
fi

echo ""
echo "[✓] Done! Version: $TAG"
echo ""
