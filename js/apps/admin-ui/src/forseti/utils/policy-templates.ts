import type { PolicyTemplate, BuilderState, Group, Clause } from "../types/policy-builder-types";

const sdkVersion = "1.0.0"; // tweak as needed for your runtime

const and = (...items: (Group | Clause)[]): Group => ({ op: "AND", items });
const or = (...items: (Group | Clause)[]): Group => ({ op: "OR", items });

const claim = (key: string, op: Clause["op"], value: string): Clause => ({
    kind: "claim",
    key,
    op,
    value,
});
const path = (op: Clause["op"], value: string): Clause => ({ kind: "path", op, value });
const method = (op: Clause["op"], value: string): Clause => ({ kind: "method", op, value });

function state(entryType: string, root: Group): BuilderState {
    return { entryType, sdkVersion, root };
}

export const DEFAULT_POLICY_TEMPLATES: PolicyTemplate[] = [
    {
        id: "allow-all",
        name: "Allow All",
        description: "Permit every request (useful for testing only).",
        icon: "✅",
        state: state("Forseti.Policies.AllowAll", and(or(path("starts", "/"), method("eq", "*")))),
    },
    {
        id: "deny-all",
        name: "Deny All",
        description: "Deny every request (fails all checks).",
        icon: "⛔",
        state: state("Forseti.Policies.DenyAll", and(and({ op: "AND", items: [] } as any))), // intentionally impossible
    },
    {
        id: "admin-only",
        name: "Admin Claim Required",
        description: "Allow only when claim 'role' equals 'admin'.",
        icon: "🛡️",
        state: state(
            "Forseti.Policies.AdminOnly",
            and(claim("role", "eq", "admin"))
        ),
    },
    {
        id: "get-readonly",
        name: "GET Read-only",
        description: "Allow only HTTP GET requests on any path.",
        icon: "📗",
        state: state("Forseti.Policies.ReadOnly", and(method("eq", "GET"))),
    },
    {
        id: "path-prefix",
        name: "Restrict to /api/private",
        description: "Allow only requests whose path starts with /api/private.",
        icon: "🧭",
        state: state("Forseti.Policies.PathPrefix", and(path("starts", "/api/private"))),
    },
    {
        id: "owner-or-admin",
        name: "Owner or Admin",
        description: "Allow if user is owner of resource or has admin role.",
        icon: "👤",
        state: state(
            "Forseti.Policies.OwnerOrAdmin",
            and(or(
                claim("role", "eq", "admin"),
                claim("sub", "eq", "resource.owner")
            ))
        ),
    },
    {
        id: "authenticated-user",
        name: "Authenticated User",
        description: "Allow any authenticated user with a valid sub claim.",
        icon: "🔐",
        state: state(
            "Forseti.Policies.AuthenticatedUser",
            and(claim("sub", "neq", ""))
        ),
    },
    {
        id: "post-only",
        name: "POST Only",
        description: "Allow only HTTP POST requests.",
        icon: "📮",
        state: state("Forseti.Policies.PostOnly", and(method("eq", "POST"))),
    },
];