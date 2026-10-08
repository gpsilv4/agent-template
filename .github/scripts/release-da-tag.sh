#!/bin/bash
# Cria o GitHub Release de uma tag de versao (chamado pelo `.github/workflows/release.yml`, #277).
#
#   bash .github/scripts/release-da-tag.sh v1.2.3
#
# Titulo: a primeira linha da tag ANOTADA (com a tag a frente, se nao a tiver).
# Notas: o corpo da tag e as notas geradas pelo GitHub (os PRs desde a versao FINAL anterior).
# Uma tag com `-` (`v1.1.0-rc1`) e publicada como pre-release.
# Idempotente: se o Release ja existe, sai 0 sem tocar nele.
set -euo pipefail
TAG="${1:?uso: release-da-tag.sh <tag>}"

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "O Release $TAG ja existe — nada a fazer."
  exit 0
fi

# O checkout de uma tag pode trazer so a referencia leve, sem o objecto da tag anotada; e, corrido
# a mao, as tags locais podem estar atrasadas (a "Latest" abaixo compara-as). Buscar TODAS as tags
# garante as duas coisas. Sem esconder o erro: se falhar, quer-se ve-lo no log.
git fetch --force --tags origin

# Numa tag LEVE, `%(contents:...)` devolve a mensagem do COMMIT, e o Release saia com o titulo de
# um commit qualquer, em silencio. A tag leve fica so com o nome no titulo, e di-lo.
if [ "$(git cat-file -t "refs/tags/$TAG")" = "tag" ]; then
  subj=$(git tag -l --format='%(contents:subject)' "$TAG")
  body=$(git tag -l --format='%(contents:body)' "$TAG")
else
  echo "::warning::$TAG e uma tag LEVE (sem mensagem): o Release fica so com o nome no titulo. Usar \`git tag -a\` (ver /deploy)."
  subj=""
  body=""
fi
case "$subj" in
  "$TAG"*) titulo="$subj" ;;
  "") titulo="$TAG" ;;
  *) titulo="$TAG — $subj" ;;
esac

# A versao ANTERIOR, por ordem de versao — e so entre versoes finais `vX.Y.Z` (mais a propria tag):
# as notas de `v1.0.0` contam desde a versao final anterior, e nao desde a `v1.0.0-rc1`. O
# `versionsort.suffix=-` poe a `-rc` ANTES da final; sem ele, a `v1.1.0-rc1` tinha a `v1.1.0`
# (mais nova) como anterior — medido.
anterior=$(git -c versionsort.suffix=- tag --sort=-v:refname | awk -v t="$TAG" '$0 == t || /^v[0-9]+\.[0-9]+\.[0-9]+$/' | grep -A1 -x -F -- "$TAG" | sed -n 2p || true)

args=(--verify-tag --title "$titulo" --generate-notes --notes "$body")
[ -n "$anterior" ] && args+=(--notes-start-tag "$anterior")
# Uma pre-release (`v1.1.0-rc1`) publica-se como tal: sem isto saia como versao final e podia
# ficar a "Latest". E nunca e a Latest.
# Uma versao final so e a "Latest" se for a MAIS ALTA: o GitHub, por omissao, faz Latest o Release
# mais recente, e um `v0.53.1` publicado depois do `v0.54.0` roubava-lhe o lugar.
maior=$(git -c versionsort.suffix=- tag --sort=-v:refname | grep -E -m1 '^v[0-9]+\.[0-9]+\.[0-9]+$' || true)
case "$TAG" in
  *-*) args+=(--prerelease --latest=false) ;;
  "$maior") args+=(--latest=true) ;;
  *) args+=(--latest=false) ;;
esac
gh release create "$TAG" "${args[@]}"
