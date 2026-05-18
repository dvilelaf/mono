#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/bd-mirror"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

MOCK_BIN="$TMP_DIR/bin"
mkdir -p "$MOCK_BIN"

cat >"$MOCK_BIN/bd" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ "$1" == "show" ]]; then
  cat <<'JSON'
[{
  "title": "Direct lookup update path",
  "description": "keep scope tight",
  "parent": "",
  "assignee": "human",
  "external_ref": "https://github.com/Jinn-Network/mono/issues/236"
}]
JSON
  exit 0
fi

echo "unexpected bd invocation: $*" >&2
exit 1
EOF
chmod +x "$MOCK_BIN/bd"

cat >"$MOCK_BIN/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

: "${GH_LOG:?GH_LOG must be set}"
printf '%s\n' "$*" >>"$GH_LOG"

case "$1 $2" in
  "project list")
    cat <<'JSON'
{"projects":[{"title":"Jinn engineering","number":7,"id":"PVT_project_123"}]}
JSON
    ;;
  "project field-list")
    cat <<'JSON'
{"fields":[{"name":"Status","id":"status_field","options":[{"name":"Todo","id":"todo_option"}]}]}
JSON
    ;;
  "api graphql")
    if [[ "$*" == *'projectItems(first:100)'* ]]; then
      cat <<'JSON'
{"data":{"repository":{"issue":{"projectItems":{"nodes":[{"id":"PVTI_item_456","project":{"id":"PVT_project_123"}}]}}}}}
JSON
    else
      echo "unexpected graphql query: $*" >&2
      exit 1
    fi
    ;;
  "project item-edit")
    ;;
  "project item-list")
    echo "unexpected project item-list invocation" >&2
    exit 1
    ;;
  *)
    echo "unexpected gh invocation: $*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$MOCK_BIN/gh"

export PATH="$MOCK_BIN:$PATH"
export GH_LOG="$TMP_DIR/gh.log"

OUTPUT="$("$SCRIPT_PATH" jinn-mono-2cl.22 none --update --status Todo)"

grep -Fq "Updated jinn-mono-2cl.22 (https://github.com/Jinn-Network/mono/issues/236): sprint=none epic=none status=Todo" <<<"$OUTPUT"
grep -Fq "api graphql" "$GH_LOG"
grep -Fq "project item-edit --id PVTI_item_456 --project-id PVT_project_123 --field-id status_field --single-select-option-id todo_option" "$GH_LOG"
if grep -Fq "project item-list" "$GH_LOG"; then
  echo "expected direct lookup, but project item-list was invoked" >&2
  exit 1
fi

echo "bd-mirror direct lookup test passed"
