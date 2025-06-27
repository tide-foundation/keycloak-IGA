#!/bin/bash

set -e

# Disable .NET telemetry if relevant
export DOTNET_CLI_TELEMETRY_OPTOUT=true

# Determine project root (directory where this script is)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Extract Keycloak version from root pom.xml
update_pom() {
  KC_VERSION=$(awk '
    /<parent>/     { in_parent=1 }
    /<\/parent>/   { in_parent=0; next }
    /<project/     { in_project=1 }
    /<\/project>/  { in_project=0 }
    in_project && !in_parent && /<version>/ && !found {
      if ($0 ~ /<version>[^<]+<\/version>/) {
        match($0, /<version>([^<]+)<\/version>/, arr)
        print arr[1]
        found=1
      }
    }
  ' "$ROOT_DIR/pom.xml")

  if [ -z "$KC_VERSION" ]; then
    echo "❌ Could not extract Keycloak version from pom.xml"
    exit 1
  else
    echo "✅ Detected Keycloak version: $KC_VERSION"
  fi

  find "$ROOT_DIR" -type f -name "pom.xml" | while read -r pom_file; do
    if grep -q "KEYCLOAKVERSION" "$pom_file"; then
      echo "🔧 Updating $pom_file..."
      sed -i.bak "s/KEYCLOAKVERSION/$KC_VERSION/g" "$pom_file"
      rm "$pom_file.bak"
    fi
  done
}

build_ext_jpa() {
  cd "$ROOT_DIR/tidecloak-iga-extensions"
  update_pom

  ./../mvnw -f shared-models/pom.xml clean install
  ./../mvnw -f tide-jpa-providers/pom.xml clean install
  ./../mvnw -f shared-utility/pom.xml clean install
}

build_ext() {
  cd "$ROOT_DIR/tidecloak-iga-extensions"
  update_pom
  ./../mvnw -f tidecloak-iga-provider/pom.xml clean install -Pbase-iga
}

build_keycloak() {
  cd "$ROOT_DIR"
  git submodule update --init --recursive
  ./mvnw -pl quarkus/deployment,quarkus/dist -am -DskipTests -DskipProtoLock clean install
}

package_keycloak_iga() {
  cd "$ROOT_DIR"

  DIST_TAR=$(find quarkus/dist/target -name "keycloak-*.tar.gz" | head -n 1)
  [ -z "$DIST_TAR" ] && echo "❌ Keycloak distribution archive not found!" && exit 1

  TMP_DIR="$ROOT_DIR/tmp_kc"
  rm -rf "$TMP_DIR"
  mkdir -p "$TMP_DIR"

  echo "📦 Extracting Keycloak distribution from: $DIST_TAR"
  tar -zxf "$DIST_TAR" -C "$TMP_DIR"

  KC_DIR=$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d)
  PROVIDER_DIR="$KC_DIR/providers"
  CONF_DIR="$KC_DIR/conf"
  KEYCLOAK_CONF="$CONF_DIR/keycloak.conf"

  echo "📁 Installing custom provider JARs..."
  mkdir -p "$PROVIDER_DIR" "$CONF_DIR"
  cp tidecloak-iga-extensions/tide-jpa-providers/target/*.jar "$PROVIDER_DIR"
  cp tidecloak-iga-extensions/shared-models/target/*.jar "$PROVIDER_DIR"
  cp tidecloak-iga-extensions/shared-utility/target/*.jar "$PROVIDER_DIR"
  cp tidecloak-iga-extensions/tidecloak-iga-provider/target/*.jar "$PROVIDER_DIR"

  echo "📝 Writing configuration to $KEYCLOAK_CONF"
  cat <<EOF > "$KEYCLOAK_CONF"
spi-user-provider=tide-User-Provider
spi-realm-provider=tideRealmProvider
spi-group-provider=tideGroupProvider
spi-client-provider=tideClientProvider
spi-role-provider=tide-role-provider
EOF

  echo
  echo "✅ Keycloak is prepared at:"
  echo "   $KC_DIR"
  echo
  echo "➡️  To start it in dev mode, run:"
  echo "   $KC_DIR/bin/kc.sh start-dev"
  echo
}



# Main build steps
build_ext_jpa
build_keycloak
build_ext
package_keycloak_iga
