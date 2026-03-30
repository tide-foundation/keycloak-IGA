package org.keycloak.testframework.oauth;

public class OAuthIdentityProviderConfigBuilder {

<<<<<<< HEAD
    private Mode mode = Mode.DEFAULT;
=======
    private boolean spiffe;
>>>>>>> origin/release/0.13.26
    private boolean jwkUse = true;

    public OAuthIdentityProviderConfigBuilder spiffe() {
        mode = Mode.SPIFFE;
        return this;
    }

    public OAuthIdentityProviderConfigBuilder kubernetes() {
        mode = Mode.KUBERNETES;
        return this;
    }

    public OAuthIdentityProviderConfigBuilder jwkUse(boolean jwkUse) {
        this.jwkUse = jwkUse;
        return this;
    }

<<<<<<< HEAD
    public OAuthIdentityProviderConfiguration build() {
        return new OAuthIdentityProviderConfiguration(mode, jwkUse);
    }

    public record OAuthIdentityProviderConfiguration(Mode mode, boolean jwkUse) {
    }

    public enum Mode {
        DEFAULT,
        SPIFFE,
        KUBERNETES
=======
    public OAuthIdentityProviderConfigBuilder jwkUse(boolean jwkUse) {
        this.jwkUse = jwkUse;
        return this;
    }

    public OAuthIdentityProviderConfiguration build() {
        return new OAuthIdentityProviderConfiguration(spiffe, jwkUse);
    }

    public record OAuthIdentityProviderConfiguration(boolean spiffe, boolean jwkUse) {
>>>>>>> origin/release/0.13.26
    }

}
